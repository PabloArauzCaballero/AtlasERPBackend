# ATLAS — Módulo CRM/Ventas B2B y Facturación Comercial

Este paquete contiene los modelos recomendados para el módulo de **Ventas y CRM B2B de ATLAS**, enfocado en clientes corporativos/comercios aliados, no en el usuario final del crédito.

## Decisión de negocio corregida

ATLAS no debe modelar las cuotas normales del consumidor como CxC B2B. La separación correcta es:

1. **CxC B2B contra comercio**: MDR, suscripción, fee de onboarding, penalidades, servicios/API, licencias.
2. **CxP ATLAS → comercio**: obligación de ATLAS de cubrir cuotas específicas cuando el consumidor no paga.
3. **CxC de recuperación contra consumidor**: solo nace después de que ATLAS cubre una cuota impaga al comercio.

## Contenido

- `docs/01_casos_de_uso.md`: casos de uso principales.
- `docs/02_modelo_relacional.md`: modelo relacional explicado por módulos.
- `docs/03_modelo_clases.md`: modelo de clases de dominio.
- `docs/04_actividades_principales.md`: flujos de actividad principales.
- `docs/05_reglas_negocio.md`: reglas de negocio e integridad.
- `sql/atlas_b2b_sales_crm_schema.sql`: DDL PostgreSQL sugerido.
- `dbml/atlas_b2b_sales_crm.dbml`: modelo relacional en DBML.
- `diagrams/plantuml/*.puml`: diagramas PlantUML.
- `diagrams/mermaid/atlas_b2b_modelos.md`: diagramas Mermaid para copiar/pegar.

## Cómo usar los diagramas

Los `.puml` pueden abrirse con PlantUML o extensiones de VS Code/IntelliJ. El archivo Mermaid puede pegarse en Mermaid Live Editor, GitHub Markdown o documentación compatible.
