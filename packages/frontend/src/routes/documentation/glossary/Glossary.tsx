import { AppPage } from "../../../app/AppPage";
import { AppPageHeader } from "../../../app/AppPageHeader";
import { Scrollable } from "../../../components/Scrollable";

export default function Glossary() {
  const terms = glossaryTerms.sort((a, b) => a.term.localeCompare(b.term));
  return (
    <AppPage>
      <AppPageHeader title="Glossary">
        <input className="search grow" placeholder="Search..." />
      </AppPageHeader>
      <Scrollable className="glass rounded-3xl border">
        <dl className=" px-8 py-6 grid gap-6">
          {terms.map((item) => (
            <div key={item.term} className="detail">
              <dt className="font-bold text-white">{item.term}</dt>
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

const glossaryTerms: GlossaryTerm[] = [
  {
    term: "MCP Server",
    definition:
      "In the context of AI, the Model Context Protocol (MCP) is an open-source standard that provides a universal way for AI models to connect with and use external data, tools, and systems.",
  },
  {
    term: "Workflow engine",
    definition:
      "A workflow engine is a software application that manages and executes modeled business processes. It interprets the process definitions, manages the state of process instances, and coordinates the execution of tasks according to the defined workflow.",
  },
  {
    term: "Core Agent Manager",
    definition:
      "The Core Agent Manager is a central component responsible for overseeing the lifecycle and operations of agents within a system. It handles tasks such as agent creation, configuration, monitoring, and termination, ensuring that agents function correctly and efficiently.",
  },
  {
    term: "Tool Registry",
    definition:
      "A Tool Registry is a centralized repository that stores and manages information about various tools, including their configurations, versions, and usage policies. It facilitates easy access and integration of tools within a system or application.",
  },
  {
    term: "Approval Manager",
    definition:
      "An Approval Manager is a system or component that oversees the approval processes within an organization. It manages the workflow of requests, ensuring that they are reviewed and approved by the appropriate personnel before proceeding to the next stage.",
  },
];
