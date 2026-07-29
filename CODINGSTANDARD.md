# Coding Standards & Regulations
**Project:** My Smart Journey  
**Architecture:** Layered (Presentation → Business Logic → Integration → Database)

## 1. Project Structure Rules
- Follow the 4-layer architecture strictly.
- Do not put business logic inside the Presentation Layer.
- Do not put database queries inside the Business Logic Layer.
- Each layer can only communicate with the layer below it.

| Layer              | Allowed Content                          | Not Allowed                     |
|--------------------|------------------------------------------|---------------------------------|
| Presentation       | UI, pages, components, routes            | Database queries, AI logic      |
| Business Logic     | Services, calculations, AI workflows     | Direct database access          |
| Integration        | Repositories, External APIs              | UI code, complex business rules |
| Database           | Models, connection, schemas              | Business logic                  |

## 2. Naming Conventions
- Python files & folders → snake_case (example: ai_itinerary_generation_service.py)
- React components → PascalCase (example: DestinationCard.tsx)
- Python variables & functions → snake_case
- TypeScript/React variables & functions → camelCase
- Classes & Components → PascalCase
- Constants → UPPER_SNAKE_CASE

## 3. Frontend (Presentation Layer) Rules
- Use TypeScript only.
- Use functional components + hooks.
- Keep components small and focused.
- Put reusable UI in components/.
- Put full pages in pages/.
- Never call external APIs or database directly from the UI.

## 4. Backend (Python) Rules
- Use type hints in every function.
- Use Pydantic models for request/response validation.
- Keep services pure (no FastAPI Request/Response inside services).
- One service = one responsibility.
- AI-related code must be placed in the Business Logic Layer.

## 5. Commenting Rules
- Every service function must have a short docstring.
- Complex logic must explain why, not just what.
- Do not write obvious comments.

## 6. Error Handling Rules
- Never leave empty try-except.
- Always return meaningful error messages.
- Use proper HTTP status codes (400, 401, 404, 500).
- Frontend must show user-friendly error messages.

## 7. Git & Collaboration Rules
- Branch naming: feature/..., bugfix/..., hotfix/...
- Commit message format: feat: ..., fix: ..., docs: ...
- Never commit .env file.
- Always pull before push.

## 8. AI Usage Rules
- AI-generated code must be reviewed by the responsible team member.
- Do not blindly accept long AI-generated code.
- All AI features must go through the Business Logic Layer.
- Document which AI model is used in the service file.