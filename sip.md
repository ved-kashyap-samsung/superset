## [SIP] Proposal for data summarization using LLM 

### Motivation

#### Summarizing SQL returned data using Language Models (LLMs) adds further value by:

- **Insight Extraction**: LLMs can extract key insights from large datasets, providing users with concise summaries of the most relevant information.
- **Contextual Understanding**: LLMs can contextualize data summaries based on the user's query, offering personalized insights tailored to their needs.
- **Automation**: Automating the summarization process reduces the manual effort required to sift through vast amounts of data, increasing efficiency and productivity.
- **Consistency**: LLMs ensure consistency in summarization by following predefined rules, reducing the risk of human error and bias.
- **Scalability**: As datasets grow, LLMs can scale to handle larger volumes of data while still providing accurate and relevant summaries, ensuring the usability of the system over time.

### Proposed Change

A sample screenshot for how the feature will be implemented using LLM.

![summarization](https://github.com/ved-kashyap-samsung/superset/assets/34643160/516bc809-17c6-4e31-b08f-8c2c2c911160)

### New or Changed Public Interfaces

There should be option of choosing LLM ex. self-hosted (fine tuned for the data) or LLM as service (from openai, google bard).

We can create an abstraction layer for using these LLMs where in user will have to provide only configurable details for LLM through UI. Example : screenshot attached.

![configure llm parameters modal](https://github.com/ved-kashyap-samsung/superset/assets/34643160/4650b84b-2bed-4fcf-bcf3-198734dd55d0)

### New dependencies

To be discussed

### Migration Plan and Compatibility

To be discussed

### Rejected Alternatives

NA
