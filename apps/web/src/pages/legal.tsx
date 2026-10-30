import { Fragment, type ReactNode } from "react";
import privacidad from "@/content/privacidad.md?raw";
import terminos from "@/content/terminos.md?raw";
import { fillLegal, useSiteConfig } from "@/lib/site";

/** Negritas **así** dentro de una línea. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

/** Markdown sencillo (títulos, párrafos y listas): suficiente para los textos legales. */
function Markdown({ source }: { source: string }) {
  const blocks = source.trim().split(/\n\s*\n/);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.startsWith("# ")) return <h1 key={i} className="font-plate text-4xl font-bold sm:text-5xl">{inline(b.slice(2))}</h1>;
        if (b.startsWith("## ")) return <h2 key={i} className="pt-4 text-xl font-semibold">{inline(b.slice(3))}</h2>;
        if (b.startsWith("- ")) {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5">
              {b.split("\n").map((l, j) => <li key={j}>{inline(l.replace(/^- /, ""))}</li>)}
            </ul>
          );
        }
        return <p key={i}>{inline(b)}</p>;
      })}
    </>
  );
}

function LegalPage({ source }: { source: string }) {
  const config = useSiteConfig();
  return (
    <article className="container grid max-w-3xl gap-4 py-10 text-[16px] leading-relaxed">
      <Markdown source={fillLegal(source, config)} />
    </article>
  );
}

export const PrivacyPage = () => <LegalPage source={privacidad} />;
export const TermsPage = () => <LegalPage source={terminos} />;
