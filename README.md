<div align="center">
  <img src="assets/images/logo/Tracklet.png" alt="Tracklet logo" width="200" height="auto" />
  <h1>Tracklet</h1>
  <p>Inventory + Operations Management</p>

<!-- Badges -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/license/MIT)
</div>

<!-- About the Project -->
## :star2: About Tracklet

Tracklet is a private inventory + operations management product built on top of [InvenTree](https://github.com/inventree/InvenTree). It keeps InvenTree’s strong low-level stock control and part tracking, but extends it with business-focused workflows and extra features designed to better fit real day-to-day operations.

At its core, Tracklet uses the same proven architecture: a Python/Django backend (admin interface + REST API) with a flexible plugin system, plus a modern web client for users.

Tracklet is based on InvenTree and includes significant custom improvements. Full credit for the original foundation goes to the InvenTree maintainers and contributors.

## :compass: Roadmap

Want to see what we’re working on?

- Check the roadmap issues: `label:roadmap`
- Follow upcoming work in the horizon milestone

(Replace these with your Tracklet repo links once you publish them.)

## :hammer_and_wrench: Integration

Tracklet is designed to be extensible and easy to integrate with other tools:

- Tracklet REST API (InvenTree-based)
- Python module (optional if you expose it)
- Plugin interface (InvenTree-based)
- Third-party tools and custom connectors

## :space_invader: Tech Stack

<details>
  <summary>Server</summary>
  <ul>
    <li><a href="https://www.python.org/">Python</a></li>
    <li><a href="https://www.djangoproject.com/">Django</a></li>
    <li><a href="https://www.django-rest-framework.org/">DRF</a></li>
    <li><a href="https://django-q.readthedocs.io/">Django Q</a></li>
    <li><a href="https://docs.allauth.org/">Django-Allauth</a></li>
  </ul>
</details>

<details>
  <summary>Database</summary>
  <ul>
    <li><a href="https://www.postgresql.org/">PostgreSQL</a></li>
    <li><a href="https://www.mysql.com/">MySQL</a></li>
    <li><a href="https://www.sqlite.org/">SQLite</a></li>
    <li><a href="https://redis.io/">Redis</a></li>
  </ul>
</details>

<details>
  <summary>Client</summary>
  <ul>
    <li><a href="https://react.dev/">React</a></li>
    <li><a href="https://lingui.dev/">Lingui</a></li>
    <li><a href="https://reactrouter.com/">React Router</a></li>
    <li><a href="https://tanstack.com/query/">TanStack Query</a></li>
    <li><a href="https://github.com/pmndrs/zustand">Zustand</a></li>
    <li><a href="https://mantine.dev/">Mantine</a></li>
    <li><a href="https://icflorescu.github.io/mantine-datatable/">Mantine Data Table</a></li>
    <li><a href="https://codemirror.net/">CodeMirror</a></li>
  </ul>
</details>

<details>
  <summary>DevOps</summary>
  <ul>
    <li><a href="https://www.docker.com/">Docker</a></li>
    <li><a href="https://crowdin.com/">Crowdin</a></li>
    <li><a href="https://about.codecov.io/">Codecov</a></li>
    <li><a href="https://www.sonarsource.com/products/sonarcloud/">SonarCloud</a></li>
  </ul>
</details>

## :toolbox: Deployment / Getting Started

Tracklet supports multiple deployment options, depending on your environment:

<div align="center">
  <h4>
    <a href="YOUR_TRACKLET_DOCS_DOCKER_LINK">Docker</a>
    <span> · </span>
    <a href="YOUR_TRACKLET_DOCS_INSTALL_LINK">Bare Metal</a>
  </h4>
</div>
