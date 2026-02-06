# Schema Design Workbench Tab in VS Code Extension

This document describes the feature of the schema design workbench that is to be implemented.

## Tab overview

The schema design workbench is something that should be it's own tab in VS Code that can be disabled through a vs code user setting. The workbench tab should contain a list of "designs" locally where each design is a valid `supergraph.yaml` for a Apollo Federated design or if none is present, a single `.graphql` file that parses as a valid schema.

## Design functionality

Inside the [Apollo Workbench](https://github.com/apollographql/apollo-workbench-vscode) extension implementation is the functionality of what we should be implementing. There are images in the base README that have a similar feel I would like to emulate. Research this repo to build a similar feeling

## GraphQL and Rover CLI

For a single graphql schema (not a Apollo Federated supergraphql.yaml design), the graphql library should be used to provide feedback on the schema design that pops up in the problems panel.

For a federated design with a supergraph.yaml, `rover supergraph compose --output json` should be used as the composition errors and location information will only be provided with the json output.

The GraphQL and `rover` processes should be performed when a user is editing a schema in any design and there should be right click commands that expose things like the schema design command on a schema in a federated design.
