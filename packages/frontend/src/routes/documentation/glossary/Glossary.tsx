import Fuse from "fuse.js";
import { useState } from "react";
import { AppPage } from "../../../app/AppPage";
import { AppPageHeader } from "../../../app/AppPageHeader";
import { Scrollable } from "../../../components/Scrollable";
import { useGlossaryTerms } from "./useGlossaryTerms";

export default function Glossary() {
  const glossaryTerms = useGlossaryTerms();
  const [search, setSearch] = useState("");
  const fuse = new Fuse(glossaryTerms, {
    keys: [
      { name: "term", weight: 0.7 },
      { name: "definition", weight: 0.3 },
    ],
    threshold: 0.7,
  });
  const results = search
    ? fuse.search(search).map((result) => result.item)
    : glossaryTerms;

  return (
    <AppPage>
      <AppPageHeader title="Glossary">
        <input
          className="search grow"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </AppPageHeader>
      <Scrollable className="glass rounded-4xl border">
        <dl className=" px-8 py-6 grid gap-6">
          {results.map((result) => (
            <div key={result.term} className="detail">
              <dt className="font-bold text-white">{result.term}</dt>
              <dd>{result.definition}</dd>
            </div>
          ))}
        </dl>
      </Scrollable>
    </AppPage>
  );
}
