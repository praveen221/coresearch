# Coresearch

Coresearch is a research harness with a minimal interface for aspiring PhD researchers who already have a target lab or supervisor. It combines student, professor, and lab context with inspectable paper evidence to help students develop research directions they understand and can defend.

The project is currently at the product-definition stage. The harness and application have not been implemented.

## Read and review

- [Product definition](docs/product.md): audience, outcome, scope, and product requirements.
- [Research workflow](docs/workflow.md): stages, evidence requirements, iteration, and student decisions.
- [Interactive workflow](index.html): a visual explanation of the intended experience, with illustrative interface content.

## Repository structure

```text
coresearch/
├── README.md
├── LICENSE
├── .gitignore
├── index.html
├── docs/
│   ├── product.md
│   ├── workflow.md
│   └── examples/
├── harness/
└── tests/
```

`docs/examples/`, `harness/`, and `tests/` are initially empty. Examples must be anonymized or explicitly suitable for public sharing.

## View the workflow locally

From the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open <http://127.0.0.1:8765/index.html>. The page demonstrates the workflow; it does not execute research jobs.

## Local research material

Keep private student context in `private/`, downloaded papers and source files in `sources/`, and generated research runs in `runs/`. These directories are ignored by Git. Do not place credentials or private application materials in public documentation or examples. Git exclusions do not provide access control; a local web server can still serve files under its document root.

## License

[MIT](LICENSE). Downloaded papers and other third-party materials retain their original licenses.
