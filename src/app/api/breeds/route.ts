import { NextResponse } from "next/server";
import { fallbackDogBreeds, fallbackCatBreeds } from "@/lib/breed-data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const species = searchParams.get("species") || "dog";
  const q = searchParams.get("q")?.toLowerCase() || "";

  try {
    let apiUrl = "";
    if (species === "dog") {
      apiUrl = "https://api.thedogapi.com/v1/breeds";
    } else if (species === "cat") {
      apiUrl = "https://api.thecatapi.com/v1/breeds";
    }

    if (apiUrl) {
      // Revalidate once per day
      const resp = await fetch(apiUrl, {
        next: { revalidate: 86400 },
      });
      
      if (resp.ok) {
        const body = await resp.json();
        let breeds = body.map((b: any) => ({
          id: String(b.id),
          name: b.name,
          temperament: b.temperament,
          life_span: b.life_span,
        }));
        
        if (q) {
          breeds = breeds.filter((b: any) => b.name.toLowerCase().includes(q));
        }
        
        return NextResponse.json({ breeds });
      }
    }
  } catch (err) {
    console.error("External breed API failed, falling back to static data", err);
  }

  // Fallback
  let fallback = species === "cat" ? fallbackCatBreeds : fallbackDogBreeds;
  
  if (species !== "dog" && species !== "cat") {
    fallback = []; // "other" species
  }

  if (q) {
    fallback = fallback.filter((b) => b.name.toLowerCase().includes(q));
  }

  return NextResponse.json({ breeds: fallback });
}
