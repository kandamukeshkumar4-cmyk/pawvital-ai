import {
  AZURE_DOC_INTEL_FEATURE_FLAG,
  intakeVetRecordDocument,
  type AzureServiceFetch,
} from "@/lib/azure/document-intelligence";

const CONFIGURED_ENV = {
  AZURE_CLIENT_ID: "client-id",
  AZURE_CLIENT_SECRET: "client-secret",
  AZURE_KEY_VAULT_NAME: "pawvital-kv",
  AZURE_TENANT_ID: "tenant-id",
};

const APP_CONFIG_CONNECTION_STRING =
  "Endpoint=https://pawvital-appconfig.azconfig.io;Id=test;Secret=test";
const APP_INSIGHTS_CONNECTION_STRING =
  "InstrumentationKey=test-key;IngestionEndpoint=https://test.in.applicationinsights.azure.com/";

function secretClientFactory(secrets: Record<string, string>) {
  return jest.fn(async () => ({
    getSecret: jest.fn(async (name: string) => ({ value: secrets[name] })),
  }));
}

function appConfigurationClientFactory(enabled: boolean) {
  return jest.fn(async () => ({
    getConfigurationSetting: jest.fn(async (setting: { key: string }) => {
      expect(setting.key).toBe(
        `.appconfig.featureflag/${AZURE_DOC_INTEL_FEATURE_FLAG}`,
      );
      return { value: JSON.stringify({ enabled }) };
    }),
  }));
}

function response(input: {
  headers?: Record<string, string>;
  json?: unknown;
  ok?: boolean;
  status?: number;
}) {
  return {
    headers: new Headers(input.headers),
    json: jest.fn(async () => input.json ?? {}),
    ok: input.ok ?? true,
    status: input.status ?? 200,
  };
}

function expectAnalyzeResultDeleted(
  fetchDocument: jest.Mock<
    ReturnType<AzureServiceFetch>,
    Parameters<AzureServiceFetch>
  >,
  callIndex = 2,
) {
  const [cleanupUrl, cleanupInit] = fetchDocument.mock.calls[callIndex];
  expect(cleanupUrl).toBe("https://poll.example/doc-1");
  expect(cleanupInit.headers).toMatchObject({
    "Ocp-Apim-Subscription-Key": "doc-secret",
  });
  expect(cleanupInit.method).toBe("DELETE");
}

const BASE_INPUT = {
  blobName: "vet-record-intake/user-1/record.pdf",
  body: Buffer.from("%PDF-1.7 test"),
  contentType: "application/pdf",
  fileName: "record.pdf",
};

const BASE_SECRETS = {
  "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
  "appinsights-connection-string": APP_INSIGHTS_CONNECTION_STRING,
  "contentsafety-endpoint": "https://centralus.api.cognitive.microsoft.com",
  "contentsafety-key": "content-secret",
  "docintel-endpoint": "https://centralus.api.cognitive.microsoft.com",
  "docintel-key": "doc-secret",
};

describe("Azure Document Intelligence vet record intake", () => {
  it("defaults off when the App Config flag is disabled", async () => {
    const fetchDocument = jest.fn<
      ReturnType<AzureServiceFetch>,
      Parameters<AzureServiceFetch>
    >();

    await expect(
      intakeVetRecordDocument(BASE_INPUT, {
        appConfigurationClientFactory: appConfigurationClientFactory(false),
        env: CONFIGURED_ENV,
        fetchDocumentIntelligence: fetchDocument,
        secretClientFactory: secretClientFactory(BASE_SECRETS),
      }),
    ).resolves.toEqual({ enabled: false, reason: "feature_disabled" });

    expect(fetchDocument).not.toHaveBeenCalled();
  });

  it("extracts context, screens it, and records page-count telemetry without raw text", async () => {
    const enqueueDocumentProcessingJob = jest.fn().mockResolvedValue({
      messageId: "document-processing-job",
      ok: true,
      queueName: "async-review",
    });
    const fetchDocument = jest
      .fn<ReturnType<AzureServiceFetch>, Parameters<AzureServiceFetch>>()
      .mockResolvedValueOnce(
        response({
          headers: { "operation-location": "https://poll.example/doc-1" },
          status: 202,
        }),
      )
      .mockResolvedValueOnce(
        response({
          json: {
            analyzeResult: {
              content: "Buddy had vomiting overnight. Lab result: ALT 70.",
              keyValuePairs: [
                {
                  key: { content: "Patient" },
                  value: { content: "Buddy" },
                },
                {
                  key: { content: "ALT" },
                  value: { content: "70" },
                },
              ],
              pages: [{ pageNumber: 1 }, { pageNumber: 2 }],
            },
            status: "succeeded",
          },
        }),
      );
    const fetchContentSafety = jest
      .fn<ReturnType<AzureServiceFetch>, Parameters<AzureServiceFetch>>()
      .mockResolvedValue(
        response({
          json: {
            categoriesAnalysis: [
              { category: "Hate", severity: 0 },
              { category: "SelfHarm", severity: 0 },
              { category: "Sexual", severity: 0 },
              { category: "Violence", severity: 0 },
            ],
          },
        }),
      );
    const transport = jest.fn();

    const result = await intakeVetRecordDocument(BASE_INPUT, {
      appConfigurationClientFactory: appConfigurationClientFactory(true),
      env: CONFIGURED_ENV,
      enqueueDocumentProcessingJob,
      fetchContentSafety,
      fetchDocumentIntelligence: fetchDocument,
      pollIntervalMs: 0,
      secretClientFactory: secretClientFactory(BASE_SECRETS),
      transport,
    });

    expect(result).toMatchObject({
      blobName: BASE_INPUT.blobName,
      contentLength: expect.any(Number),
      demoUpload: true,
      enabled: true,
      fields: [
        { key: "Patient", value: "Buddy" },
        { key: "ALT", value: "70" },
      ],
      ok: true,
      pageCount: 2,
    });
    expect(result.enabled && result.ok ? result.contextText : "").toContain(
      "Vet record context from uploaded PDF",
    );

    const [analyzeUrl, analyzeInit] = fetchDocument.mock.calls[0];
    expect(String(analyzeUrl)).toContain(
      "/documentintelligence/documentModels/prebuilt-layout:analyze",
    );
    expect(String(analyzeUrl)).toContain("features=keyValuePairs");
    expect(analyzeInit.headers).toMatchObject({
      "Content-Type": "application/pdf",
      "Ocp-Apim-Subscription-Key": "doc-secret",
    });
    expectAnalyzeResultDeleted(fetchDocument);

    const [, safetyInit] = fetchContentSafety.mock.calls[0];
    expect(JSON.parse(String(safetyInit.body))).toMatchObject({
      categories: ["Hate", "SelfHarm", "Sexual", "Violence"],
      outputType: "FourSeverityLevels",
    });

    expect(JSON.stringify(result)).not.toContain("doc-secret");
    expect(JSON.stringify(result)).not.toContain("content-secret");
    expect(enqueueDocumentProcessingJob).toHaveBeenCalledWith(
      "document-processing",
      expect.objectContaining({
        blobName: BASE_INPUT.blobName,
        contentLength: expect.any(Number),
        jobId: expect.stringMatching(/^document-processing-/),
        pageCount: 2,
        source: "vet-record-intake",
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(/^document-processing-/),
      }),
    );
    expect(JSON.stringify(enqueueDocumentProcessingJob.mock.calls)).not.toContain(
      "Buddy had vomiting",
    );
    expect(transport).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify(
        transport.mock.calls[0][0].envelope.data.baseData.measurements,
      ),
    ).toContain("2");
    expect(JSON.stringify(transport.mock.calls[0][0])).not.toContain(
      "Buddy had vomiting",
    );
  });

  it("keeps successful document intake available when async queueing fails", async () => {
    const fetchDocument = jest
      .fn<ReturnType<AzureServiceFetch>, Parameters<AzureServiceFetch>>()
      .mockResolvedValueOnce(
        response({
          headers: { "operation-location": "https://poll.example/doc-1" },
          status: 202,
        }),
      )
      .mockResolvedValueOnce(
        response({
          json: {
            analyzeResult: {
              content: "Normal lab result note.",
              pages: [{ pageNumber: 1 }],
            },
            status: "succeeded",
          },
        }),
      );
    const fetchContentSafety = jest
      .fn<ReturnType<AzureServiceFetch>, Parameters<AzureServiceFetch>>()
      .mockResolvedValue(
        response({
          json: {
            categoriesAnalysis: [
              { category: "Hate", severity: 0 },
              { category: "SelfHarm", severity: 0 },
              { category: "Sexual", severity: 0 },
              { category: "Violence", severity: 0 },
            ],
          },
        }),
      );

    const result = await intakeVetRecordDocument(BASE_INPUT, {
      appConfigurationClientFactory: appConfigurationClientFactory(true),
      enqueueDocumentProcessingJob: jest
        .fn()
        .mockRejectedValue(new Error("queue unavailable")),
      env: CONFIGURED_ENV,
      fetchContentSafety,
      fetchDocumentIntelligence: fetchDocument,
      pollIntervalMs: 0,
      secretClientFactory: secretClientFactory(BASE_SECRETS),
    });

    expect(result).toMatchObject({
      enabled: true,
      ok: true,
      pageCount: 1,
    });
    expectAnalyzeResultDeleted(fetchDocument);
  });

  it("keeps successful document intake available when analyze-result cleanup fails", async () => {
    const fetchDocument = jest
      .fn<ReturnType<AzureServiceFetch>, Parameters<AzureServiceFetch>>()
      .mockResolvedValueOnce(
        response({
          headers: { "operation-location": "https://poll.example/doc-1" },
          status: 202,
        }),
      )
      .mockResolvedValueOnce(
        response({
          json: {
            analyzeResult: {
              content: "Normal lab result note.",
              pages: [{ pageNumber: 1 }],
            },
            status: "succeeded",
          },
        }),
      )
      .mockRejectedValueOnce(new Error("delete unavailable"));
    const fetchContentSafety = jest
      .fn<ReturnType<AzureServiceFetch>, Parameters<AzureServiceFetch>>()
      .mockResolvedValue(
        response({
          json: {
            categoriesAnalysis: [
              { category: "Hate", severity: 0 },
              { category: "SelfHarm", severity: 0 },
              { category: "Sexual", severity: 0 },
              { category: "Violence", severity: 0 },
            ],
          },
        }),
      );

    const result = await intakeVetRecordDocument(BASE_INPUT, {
      appConfigurationClientFactory: appConfigurationClientFactory(true),
      env: CONFIGURED_ENV,
      fetchContentSafety,
      fetchDocumentIntelligence: fetchDocument,
      pollIntervalMs: 0,
      secretClientFactory: secretClientFactory(BASE_SECRETS),
    });

    expect(result).toMatchObject({
      enabled: true,
      ok: true,
      pageCount: 1,
    });
    expectAnalyzeResultDeleted(fetchDocument);
  });

  it("blocks unsafe extracted text without returning the extracted context", async () => {
    const fetchDocument = jest
      .fn<ReturnType<AzureServiceFetch>, Parameters<AzureServiceFetch>>()
      .mockResolvedValueOnce(
        response({
          headers: { "operation-location": "https://poll.example/doc-1" },
          status: 202,
        }),
      )
      .mockResolvedValueOnce(
        response({
          json: {
            analyzeResult: {
              content: "unsafe extracted text",
              pages: [{}],
            },
            status: "succeeded",
          },
        }),
      );
    const fetchContentSafety = jest
      .fn<ReturnType<AzureServiceFetch>, Parameters<AzureServiceFetch>>()
      .mockResolvedValue(
        response({
          json: {
            categoriesAnalysis: [{ category: "Violence", severity: 6 }],
          },
        }),
      );

    const result = await intakeVetRecordDocument(BASE_INPUT, {
      appConfigurationClientFactory: appConfigurationClientFactory(true),
      env: CONFIGURED_ENV,
      fetchContentSafety,
      fetchDocumentIntelligence: fetchDocument,
      pollIntervalMs: 0,
      secretClientFactory: secretClientFactory(BASE_SECRETS),
    });

    expect(result).toEqual({
      categories: [{ category: "Violence", severity: 6 }],
      enabled: true,
      ok: false,
      pageCount: 1,
      reason: "content_safety_blocked",
    });
    expect(JSON.stringify(result)).not.toContain("unsafe extracted text");
    expectAnalyzeResultDeleted(fetchDocument);
  });

  it("fails closed when Content Safety is unavailable", async () => {
    const missingContentSafetyFactory = secretClientFactory({
      ...BASE_SECRETS,
      "contentsafety-key": "",
    });
    const fetchDocument = jest
      .fn<ReturnType<AzureServiceFetch>, Parameters<AzureServiceFetch>>()
      .mockResolvedValueOnce(
        response({
          headers: { "operation-location": "https://poll.example/doc-1" },
          status: 202,
        }),
      )
      .mockResolvedValueOnce(
        response({
          json: {
            analyzeResult: {
              content: "normal vet record text",
              pages: [{}],
            },
            status: "succeeded",
          },
        }),
      );

    await expect(
      intakeVetRecordDocument(BASE_INPUT, {
        appConfigurationClientFactory: appConfigurationClientFactory(true),
        env: CONFIGURED_ENV,
        fetchDocumentIntelligence: fetchDocument,
        pollIntervalMs: 0,
        secretClientFactory: missingContentSafetyFactory,
      }),
    ).resolves.toEqual({
      enabled: false,
      reason: "content_safety_unavailable",
    });
  });

  it("redacts Azure service failures", async () => {
    const fetchDocument = jest
      .fn<ReturnType<AzureServiceFetch>, Parameters<AzureServiceFetch>>()
      .mockResolvedValueOnce(
        response({
          json: { error: { message: "doc-secret leaked" } },
          ok: false,
          status: 403,
        }),
      );

    const result = await intakeVetRecordDocument(BASE_INPUT, {
      appConfigurationClientFactory: appConfigurationClientFactory(true),
      env: CONFIGURED_ENV,
      fetchDocumentIntelligence: fetchDocument,
      secretClientFactory: secretClientFactory(BASE_SECRETS),
    });

    expect(result).toEqual({
      enabled: false,
      reason: "document_unavailable",
    });
    expect(JSON.stringify(result)).not.toContain("doc-secret");
  });
});
