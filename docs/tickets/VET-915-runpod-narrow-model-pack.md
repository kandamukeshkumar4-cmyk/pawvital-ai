# VET-915 - RunPod Narrow Model Pack

## Goal

Use RunPod for narrow, testable models that improve specific subproblems without taking over triage.

## Candidate Experiments

1. owner-language normalization
2. symptom/entity extraction
3. retrieval reranking
4. urgency cue classification

## Rules

- no end-to-end diagnosis model
- no direct replacement of deterministic emergency logic
- every experiment needs a benchmark and rollback rule

## Required Inputs

- labeled benchmark slices
- held-out validation set
- baseline comparison from the current app

## Done Criteria

- experiment config is versioned
- manifest is generated
- offline metric and acceptance threshold are defined
