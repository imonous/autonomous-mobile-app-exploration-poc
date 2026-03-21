# Autonomous Exploration of Mobile Applications for Automated Testing

**Provided by *bunq* for the *Software Project 2025-2026 Q4* course.**

---

## Project Description

Modern mobile applications contain complex user interfaces with many possible user flows and application states. Maintaining reliable automated tests and up-to-date documentation for large-scale applications like bunq is challenging because new releases frequently introduce UI and userflow changes.

Currently, a considerable amount of manual and semi-manual work is required to keep the single source of truth for application documentation and automated tests up to date. Engineers regularly adjust UI mappings, update automated tests, and verify user flows after releases. This work is repetitive and time-consuming while still leaving gaps in test coverage.

The goal of this project is to design and implement a software framework that automatically explores a mobile application and constructs a structured representation of its UI states and navigation flows.

The system will interact with a mobile application through an existing UI automation framework such as Appium. During exploration, the framework captures UI metadata (hierarchies and element attributes), identifies application states, and builds a graph of screens and transitions.

The team will design and implement an automated exploration engine that navigates the application through UI interactions and observes resulting states. The framework should efficiently discover new screens and workflows while minimising redundant exploration.

**Core engineering challenges include:**

- Designing a strategy to select UI actions more intelligently than standard heuristic crawling (BFS/DFS) to discover unique app states within a fixed time budget.
- Developing a system to cluster functionally equivalent screens using structural fingerprints and textual similarity to reduce redundant states while preserving test coverage.
- Implementing a ranking system for UI element locators to improve the stability and "self-healing" capabilities of automated interaction scripts.

**Impact:**
This framework is expected to reduce repetitive QA and engineering hours by 30–50% while increasing automated test coverage by 30–60%, reducing bugs reaching production.

**Key features of the resulting solution:**

- An automated exploration engine capable of navigating complex mobile application workflows.
- A scalable data pipeline for processing and storing hierarchical DOM structures and screen states.
- A semantic representation layer to categorize and deduplicate captured application screens.
- Comprehensive system documentation and an automated testing suite for the exploration framework.

---

## Abstract

This project develops a framework that autonomously explores mobile applications to map UI states and user flows. By analysing UI metadata and navigation transitions, the system aims to reduce manual QA work, increase automated test coverage, and improve reliability of complex mobile applications such as banking apps.
