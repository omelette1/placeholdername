# Related work and originality

Automated security testing, differential testing, and version comparison are established ideas. This project makes no novelty claim for them.

- [OWASP Web Security Testing Guide](https://devguide.owasp.org/en/06-verification/01-guides/01-wstg/) provides established web security testing guidance. We use a narrowly defined authorization expectation rather than claiming comprehensive coverage.
- [ZAP Access Control Testing](https://www.zaproxy.org/docs/desktop/addons/access-control-testing/) addresses authorization testing; [ZAP Automation Framework](https://www.zaproxy.org/docs/automate/automation-framework/) supports automated test plans. This milestone neither integrates ZAP nor implements a scanner.
- [Playwright](https://playwright.dev/docs/intro) supplies browser automation. Here it verifies the dashboard workflow; behavioral comparison uses real HTTP requests to isolated local target processes.

Sentinel and Security Platoon were named as reference boundaries in the brief. No source, branding, interface, assets or descriptions from those projects were used. Their capabilities have not been evaluated here. The implementation and muted green, numbered evidence-review interface were created for this repository. The listed resources are conceptual context, not copied implementation.

Implemented: one fixed sample pair, confirmed rule, identical HTTP scenario, owner control, source diff/hashes, persistent evidence/history and reruns. Planned: broader version selection, hardened execution, richer repair verification, correctness and performance. Passing this test says nothing about untested application behavior.
