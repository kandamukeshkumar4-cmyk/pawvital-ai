import { NextResponse } from "next/server";
import { fallbackDogBreeds } from "@/lib/breed-data";

type ExternalBreed = {
  id?: string | number;
  name?: string;
  temperament?: string;
  life_span?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const species = (searchParams.get("species") || "dog").trim().toLowerCase();
  const q = searchParams.get("q")?.toLowerCase() || "";

  if (species !== "dog") {
    return NextResponse.json(
      {
        error: "PawVital currently supports dogs only.",
        breeds: [],
      },
      { status: 400 }
    );
  }

  try {
    const apiUrl = "https://api.thedogapi.com/v1/breeds";

    if (apiUrl) {
      // Revalidate once per day
      const resp = await fetch(apiUrl, {
        next: { revalidate: 86400 },
      });
      
      if (resp.ok) {
        const body: unknown = await resp.json();
        if (!Array.isArray(body)) {
          throw new Error("Invalid breeds response shape");
        }
        let breeds = body.map((item: unknown) => {
          const b = item as ExternalBreed;
          return {
            id: String(b.id ?? ""),
            name: String(b.name ?? ""),
            temperament: b.temperament,
            life_span: b.life_span,
          };
        });

        if (q) {
          breeds = breeds.filter((b) => b.name.toLowerCase().includes(q));
        }
        
        return NextResponse.json({ breeds });
      }
    }
  } catch (err) {
    console.error("External breed API failed, falling back to static data", err);
  }

  // Fallback
  let fallback = fallbackDogBreeds;

  if (q) {
    fallback = fallback.filter((b) => b.name.toLowerCase().includes(q));
  }

  return NextResponse.json({ breeds: fallback });
}
