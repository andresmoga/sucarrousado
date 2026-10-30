/**
 * Almacenamiento: claves seguras, disco local y S3/R2.
 * La parte de S3 corre si hay un servicio compatible en S3_TEST_ENDPOINT (por ejemplo `moto_server -p 9555`).
 */
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalStorage, S3Storage, keyOf, storageFromEnv } from "./storage";

describe("almacenamiento", () => {
  it("no deja salir de la carpeta", () => {
    expect(keyOf("/uploads/u/1/a.jpg")).toBe("u/1/a.jpg");
    expect(() => keyOf("/uploads/../etc/passwd")).toThrow();
    expect(() => keyOf("/uploads/u//a.jpg")).toThrow();
  });

  it("guarda y lee en disco", async () => {
    const s = new LocalStorage(await mkdtemp(join(tmpdir(), "tcu-st-")));
    await s.put("u/x/a.jpg", Buffer.from("hola"), "image/jpeg");
    expect((await s.get("u/x/a.jpg")).toString()).toBe("hola");
    expect(s.publicUrl()).toBeNull();
  });

  it("exige las variables de S3", () => {
    expect(() => storageFromEnv({ STORAGE_DRIVER: "s3" })).toThrow(/S3_BUCKET/);
  });

  const endpoint = process.env.S3_TEST_ENDPOINT;
  (endpoint ? it : it.skip)("guarda y lee en S3 (servicio compatible)", async () => {
    const cfg = { bucket: "tcu-prueba", endpoint, region: "us-east-1", accessKeyId: "x", secretAccessKey: "x", publicUrl: "https://fotos.ejemplo.co/", forcePathStyle: true };
    const client = new S3Client({ region: cfg.region, endpoint, forcePathStyle: true, credentials: { accessKeyId: "x", secretAccessKey: "x" } });
    await client.send(new CreateBucketCommand({ Bucket: cfg.bucket })).catch(() => undefined);
    const s = new S3Storage(cfg);
    await s.put("u/1/foto.jpg", Buffer.from([0xff, 0xd8, 0xff, 1, 2]), "image/jpeg");
    expect([...(await s.get("u/1/foto.jpg"))]).toEqual([0xff, 0xd8, 0xff, 1, 2]);
    expect(s.publicUrl("u/1/foto.jpg")).toBe("https://fotos.ejemplo.co/u/1/foto.jpg");
  });
});
