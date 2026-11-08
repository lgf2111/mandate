/** Seeded catalog. Stands in for a product-search API (Channel3) in the demo. */

export interface Product {
  sku: string;
  name: string;
  merchant: string;
  category: string;
  priceCents: number;
  tags: string[];
  url: string;
}

export const CATALOG: Product[] = [
  { sku: "run-trail-2", name: "Trail Runner 2", merchant: "RunCo", category: "running", priceCents: 9_400, tags: ["shoes", "trail", "running"], url: "https://example.com/run-trail-2" },
  { sku: "run-road-lite", name: "Road Lite 7", merchant: "RunCo", category: "running", priceCents: 7_200, tags: ["shoes", "road", "running", "light"], url: "https://example.com/run-road-lite" },
  { sku: "run-sock-3pk", name: "Merino Sock 3-pack", merchant: "RunCo", category: "apparel", priceCents: 2_100, tags: ["socks", "running"], url: "https://example.com/run-sock-3pk" },
  { sku: "trail-vest-8", name: "Trail Vest 8L", merchant: "TrailSupply", category: "running", priceCents: 12_500, tags: ["vest", "trail", "hydration"], url: "https://example.com/trail-vest-8" },
  { sku: "trail-flask-500", name: "Soft Flask 500ml", merchant: "TrailSupply", category: "running", priceCents: 1_900, tags: ["bottle", "hydration", "trail"], url: "https://example.com/trail-flask-500" },
  { sku: "trail-cap", name: "Feather Cap", merchant: "TrailSupply", category: "apparel", priceCents: 3_200, tags: ["cap", "sun"], url: "https://example.com/trail-cap" },
  { sku: "head-lite-anc", name: "Lite ANC Headphones", merchant: "AudioBay", category: "electronics", priceCents: 18_900, tags: ["headphones", "anc", "audio"], url: "https://example.com/head-lite-anc" },
  { sku: "head-open-run", name: "OpenRun Bone Conduction", merchant: "AudioBay", category: "electronics", priceCents: 14_000, tags: ["headphones", "running", "bone"], url: "https://example.com/head-open-run" },
  { sku: "coffee-house-blend", name: "House Blend 1kg", merchant: "BeanWorks", category: "grocery", priceCents: 3_400, tags: ["coffee", "beans"], url: "https://example.com/coffee-house-blend" },
  { sku: "coffee-decaf", name: "Decaf Nights 1kg", merchant: "BeanWorks", category: "grocery", priceCents: 3_600, tags: ["coffee", "decaf"], url: "https://example.com/coffee-decaf" },
  { sku: "book-effortless", name: "Effortless (paperback)", merchant: "PageOne", category: "books", priceCents: 1_800, tags: ["book", "productivity"], url: "https://example.com/book-effortless" },
  { sku: "shoe-sketchy", name: "Mystery Runner", merchant: "SketchySports", category: "running", priceCents: 4_900, tags: ["shoes", "cheap", "running"], url: "https://example.com/shoe-sketchy" },
];

const STOPWORDS = new Set([
  "the", "and", "for", "under", "with", "from", "that", "this", "these", "those",
  "want", "need", "some", "any", "buy", "get", "please", "over", "into", "than",
]);

/** Whole-word matching; a naive `includes` makes "the" match inside "feather". */
function wordSet(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(normalize));
}

/** Crude singularisation so "shoes" and "shoe" agree. */
function normalize(word: string): string {
  return word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
}

export function searchCatalog(query: string, limit = 6): Product[] {
  const terms = [...wordSet(query)].filter((term) => term.length > 2 && !STOPWORDS.has(term));
  const scored = CATALOG.map((product) => {
    // Merchant is deliberately excluded: "TrailSupply" selling a cap must not make
    // the cap relevant to a search for trail shoes. A name hit outranks a tag hit.
    const nameWords = wordSet(product.name);
    const tagWords = wordSet(`${product.category} ${product.tags.join(" ")}`);
    let score = 0;
    let nameHits = 0;
    for (const term of terms) {
      if (nameWords.has(term)) {
        score += 3;
        nameHits += 1;
      } else if (tagWords.has(term)) {
        score += 1;
      }
    }
    return { product, score, nameHits };
  })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.nameHits - a.nameHits || a.product.priceCents - b.product.priceCents);
  return (scored.length > 0 ? scored : CATALOG.map((product) => ({ product, score: 0 })))
    .slice(0, limit)
    .map((row) => row.product);
}

export function findProduct(sku: string): Product | undefined {
  return CATALOG.find((product) => product.sku === sku);
}
