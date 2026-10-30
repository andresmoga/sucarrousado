/** Catálogos de la publicación (equivalentes a los atributos de MercadoLibre/TuCarro). */

/**
 * Municipios donde se puede publicar, agrupados por departamento (capitales, áreas metropolitanas y
 * municipios con parque automotor grande). El ajuste de precio por región va por departamento (pricing.ts).
 */
export const CITY_GROUPS = [
  { department: "Bogotá D. C.", cities: ["Bogotá"] },
  {
    department: "Cundinamarca",
    cities: ["Chía", "Cajicá", "Cota", "Funza", "Mosquera", "Madrid", "Facatativá", "Soacha", "Zipaquirá", "Tocancipá", "Sopó", "La Calera", "Tenjo", "Tabio", "Sibaté", "Fusagasugá", "Girardot", "Ubaté"],
  },
  { department: "Antioquia", cities: ["Medellín", "Envigado", "Sabaneta", "Itagüí", "Bello", "La Estrella", "Copacabana", "Rionegro", "La Ceja", "Marinilla", "Caldas (Antioquia)", "Apartadó"] },
  { department: "Valle del Cauca", cities: ["Cali", "Jamundí", "Palmira", "Yumbo", "Tuluá", "Buga", "Cartago", "Buenaventura"] },
  { department: "Atlántico", cities: ["Barranquilla", "Soledad", "Puerto Colombia", "Malambo"] },
  { department: "Santander", cities: ["Bucaramanga", "Floridablanca", "Girón", "Piedecuesta", "Barrancabermeja", "San Gil"] },
  { department: "Bolívar", cities: ["Cartagena", "Turbaco", "Magangué"] },
  { department: "Risaralda", cities: ["Pereira", "Dosquebradas", "Santa Rosa de Cabal"] },
  { department: "Caldas", cities: ["Manizales", "Villamaría"] },
  { department: "Quindío", cities: ["Armenia", "Calarcá"] },
  { department: "Boyacá", cities: ["Tunja", "Duitama", "Sogamoso", "Paipa", "Chiquinquirá"] },
  { department: "Tolima", cities: ["Ibagué", "Espinal"] },
  { department: "Huila", cities: ["Neiva", "Pitalito"] },
  { department: "Meta", cities: ["Villavicencio", "Acacías"] },
  { department: "Norte de Santander", cities: ["Cúcuta", "Villa del Rosario", "Los Patios", "Ocaña"] },
  { department: "Nariño", cities: ["Pasto", "Ipiales"] },
  { department: "Cauca", cities: ["Popayán"] },
  { department: "Córdoba", cities: ["Montería"] },
  { department: "Sucre", cities: ["Sincelejo"] },
  { department: "Cesar", cities: ["Valledupar"] },
  { department: "Magdalena", cities: ["Santa Marta"] },
  { department: "La Guajira", cities: ["Riohacha"] },
  { department: "Casanare", cities: ["Yopal"] },
  { department: "Caquetá", cities: ["Florencia"] },
  { department: "Chocó", cities: ["Quibdó"] },
  { department: "Putumayo", cities: ["Mocoa"] },
  { department: "Arauca", cities: ["Arauca"] },
  { department: "San Andrés", cities: ["San Andrés"] },
  { department: "Amazonas", cities: ["Leticia"] },
] as const;

export type City = (typeof CITY_GROUPS)[number]["cities"][number];
export const CITIES = CITY_GROUPS.flatMap((g) => g.cities) as unknown as [City, ...City[]];

/** Departamento de un municipio del catálogo (o null si no está). */
export function departmentOf(city: string): string | null {
  return CITY_GROUPS.find((g) => (g.cities as readonly string[]).includes(city))?.department ?? null;
}

/** Marcas que se venden en Colombia (sugerencias; el vendedor puede escribir otra). */
export const BRANDS = [
  "Chevrolet", "Renault", "Mazda", "Kia", "Toyota", "Nissan", "Volkswagen", "Ford", "Hyundai", "Suzuki",
  "Mercedes-Benz", "BMW", "Audi", "Honda", "Mitsubishi", "Peugeot", "Citroën", "Jeep", "Subaru", "Volvo",
  "BYD", "Chery", "JAC", "DFSK", "Great Wall", "Changan", "MG", "Jetour", "Fiat", "Dodge", "RAM",
  "Land Rover", "Porsche", "Mini", "SsangYong", "Seat", "Skoda", "Foton", "Isuzu", "Tesla", "Lexus", "Alfa Romeo",
] as const;

export const FUELS = ["Gasolina", "Diésel", "Híbrido", "Híbrido enchufable", "Eléctrico"] as const;
export type Fuel = (typeof FUELS)[number];

export const TRANSMISSIONS = ["Automática", "Mecánica"] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

export const BODY_TYPES = ["Sedán", "Hatchback", "SUV", "Pick-up", "Coupé", "Van"] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const COLORS = ["Blanco", "Negro", "Gris", "Plata", "Rojo", "Azul", "Verde", "Beige", "Café"] as const;

export const FEATURES = [
  "Aire acondicionado",
  "Frenos ABS",
  "Airbags laterales",
  "Cámara de reversa",
  "Sensores de parqueo",
  "Techo corredizo",
  "Sillas en cuero",
  "Apple CarPlay / Android Auto",
  "Control crucero",
  "Rines de lujo",
  "Alarma",
  "Vidrios eléctricos",
] as const;
export type Feature = (typeof FEATURES)[number];

/** Fotos guiadas: el orden es el de la galería del aviso. */
export const PHOTO_SLOTS = [
  { key: "tres_cuartos", label: "Tres cuartos delantero", required: true },
  { key: "frente", label: "Frente", required: true },
  { key: "lateral", label: "Lateral", required: true },
  { key: "trasera", label: "Trasera", required: true },
  { key: "tablero", label: "Tablero con kilometraje", required: false },
  { key: "sillas_delanteras", label: "Sillas delanteras", required: false },
  { key: "sillas_traseras", label: "Sillas traseras", required: false },
  { key: "motor", label: "Motor", required: false },
  { key: "llanta", label: "Llanta y rin", required: false },
  { key: "baul", label: "Baúl", required: false },
  { key: "detalle_1", label: "Detalle o daño", required: false },
  { key: "detalle_2", label: "Otro detalle", required: false },
] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number]["key"];
export const PHOTO_SLOT_KEYS = PHOTO_SLOTS.map((s) => s.key) as [PhotoSlot, ...PhotoSlot[]];
export const MIN_PHOTOS = PHOTO_SLOTS.filter((s) => s.required).length;

/** Días que dura un aviso gratis. */
export const FREE_LISTING_DAYS = 60;
/** Avisos activos permitidos a un particular en el plan gratis. */
export const FREE_ACTIVE_LISTINGS = 1;
