import { AppPage } from "../../../app/AppPage";
import { AppPageHeader } from "../../../app/AppPageHeader";
import { Scrollable } from "../../../components/Scrollable";

export default function Glossary() {
  return (
    <AppPage>
      <AppPageHeader title="Glossary" />
      <Scrollable className="glass rounded-3xl border">
        <dl className=" px-8 py-6 grid gap-6">
          {glossaryTerms.map((item) => (
            <div key={item.term} className="detail">
              <dt className="font-bold">{item.term}</dt>
              <dd>{item.definition}</dd>
            </div>
          ))}
        </dl>
      </Scrollable>
    </AppPage>
  );
}

interface GlossaryTerm {
  term: string;
  definition: string;
}

interface GlossaryTerm {
  term: string;
  definition: string;
}

const glossaryTerms: GlossaryTerm[] = [
  {
    term: "MCP Server",
    definition:
      "In the context of AI, the Model Context Protocol (MCP) is an open-source standard that provides a universal way for AI models to connect with and use external data, tools, and systems.",
  },
];

// Term component for providing a popover or tooltip in the future
export function Term(props: { term: string }) {
  return <span>{props.term}</span>;
}
