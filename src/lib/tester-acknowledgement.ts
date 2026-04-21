export {
  TESTER_CONSENT_STORAGE_KEY as TESTER_ACKNOWLEDGEMENT_STORAGE_KEY,
  TESTER_CONSENT_VERSION as TESTER_ACKNOWLEDGEMENT_VERSION,
  getTesterConsent as getTesterAcknowledgement,
  hasTesterConsent as hasTesterAcknowledgement,
  recordTesterConsent as recordTesterAcknowledgement,
  type TesterConsentRecord as TesterAcknowledgementRecord,
} from "@/lib/tester-consent";
