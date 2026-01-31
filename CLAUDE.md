# Dynamic Operations Instructions

This is a set of instructions that should be used to create a plan and then implement dynamic operation generation.

## Process Overview

A user should be able to provide a text input and generate a operation based on what is available in the GraphQL schema. The process would follow:

1. User enters input
2. User input is embedded into a vector representation
3. A cosine similarity search is performed on the vector store with the users input to find the most relevant root fields (Query/Mutation/Subscription) to the user input.
4. The search results should be limited to documents with a similarity score greater than 0.4 with a maximum of 50 documents as the defaults. Both the similarity score and maximum documents should be arguments that can be adjusted.
5. A LLM is invoked with each document in the chat history with a role "assistant" and the content formatted as `${r.metadata.source}:${r.text}` and the final chant message is from the user with content `My assistant returned the most relevant root fields based on my input: "${input}", which root field (Query, Mutation, Subscription) is most relevant? Respond with ONLY the root field (i.e Query, Mutation, Subscription)`.
6. The LLM response should be parsed to determine what type of root it thinks the user is asking about (Query, Mutation, Subscription)
7. The documents returned in the search result from step 3 should be filtered based on the result from step 6
8. A new chat history is used to invoke the same LLM with a "system" message "Your goal is to select what you think is the most relevant field related to the users input. The assistant messages are the text for root Query/Mutation/Subscription fields of a GraphQL API." and the filtered results from step 7 are provided as "assistant" messages with content `${doc.id}:${doc.text}` and the final chat message should be a "user" message with content `Based on the above information, which root field (Query, Mutation, Subscription) is most relevant to the user request: ${input}? Respond with ONLY the id of the most relevant field`
9. Based on the most relevant root field, a search in the vector store should be performed to retreive the return type for the root field and a recursive search for all types referenced in the return type fields. If the root field has an input type that isn't a default GraphQL scalar, that should be included in the search.
10. A final LLM invoke should be created with a system message `Your goal is to generate a valid GraphQL operation and example variables based on the assistant documents in the chat history` and the root field result from step 8 and the results from step 9 should be included as the following messages. The final message of the history should be from the user with content `My assistant returned the most relevant pieces of the GraphQL schema, can you generate me a valid GraphQL operation for my initial question: "${input}"`
11. The generated GraphQL operation should be parsed using `graphql-js` to ensure it is valid
12. If there are any errors returned from parsing the generated operation, a new LLM chat history should be invoked that provides all of the errors and the generated operation asking the LLM to fix the operation.
13. Step 12 should be repeated up to 5 times until the operation is successfully parsed without any errors. The number of times this loops should be an argument that is configuratble
14. The final generated operation should be returned from the method that is called to generate the operation

## LLM Providers

Dynamic operation generation will require LLM capabilities used in a multiple agent process that combines the embeddings created from a GraphQL schema. The default LLM provider should be Ollama but a user should be able to add OpenAI or Anthropic as providers. The providers should be created using an interface pattern that enables others to contribute new providers to this repository. QWen-2.5 should be the default model used but the model should be able to be changed as an argument value

## Embeddings

The method to generate the dynamic operation should accept a vector representation for the user's input, NOT THE TEXT AS A STRING. The `graphql-embedding` packages provides a specific embedding model that would be used to embed the users initial text, but the intention is that a user might want to use a different embedding model and it would be their responsibility to embed the users input prior to calling the dynamic operation method.
