# Outdated container image

This synthetic project intentionally references the old `nginx:1.14.2` image.
It contains no application code and does not build or run a container.

## Try the optional CVE scan

The scanner only examines images already present in local Docker and uses the
locally cached Trivy vulnerability database. It does not pull images or update
the database.

1. Install a trusted Trivy executable outside this folder.
2. With Docker available, explicitly pull the sample image:
   `docker pull nginx:1.14.2`
3. In Patch, choose this folder, select **Saved project files**, enable
   **Optional container CVE scan**, and run **Scan project**.
4. Review the separate **Container images** section. If Trivy reports a
   high/critical CVE, inspect its package, installed version, and any fixed
   version before choosing a supported replacement image. Update this
   Dockerfile, make that image available locally, and scan again.

A missing image, Trivy executable, or vulnerability database is **not
assessed**, not a clean result. The sample does not promise a particular CVE:
findings depend on the image's actual package inventory and the local database.
The scanner reports only high/critical matches. It does not prove deployment,
exposure, exploitability, or that a proposed image update is compatible.
