Coding Standards & Regulations
Project: My Smart Journey
Architecture: Layered (Presentation → Business Logic → Integration → Database)

========================================================
1. Project Structure Rules
========================================================

All code must follow the four-layer architecture strictly.

The Presentation Layer is only for user interface and user interaction. It must never contain business logic, database queries, or AI processing.

The Business Logic Layer contains all core application logic, calculations, AI workflows, and decision making. This layer must not access the database directly.

The Integration Layer is responsible for data access and communication with external services. Repositories and external API clients belong here.

The Database Layer only contains models, schemas, and database connection logic. No business rules are allowed here.

Each layer may only communicate with the layer directly below it. Skipping layers is not allowed.

========================================================
2. Naming Conventions
========================================================

Python files and folders must use snake_case.
Example: ai_itinerary_generation_service.py, user_repository.py

React component files must use PascalCase.
Example: DestinationCard.tsx, SustainabilityDashboard.tsx

Python variables and functions must use snake_case.
Example: calculate_carbon_footprint(), user_preferences

TypeScript and React variables and functions must use camelCase.
Example: handleStartPlanning(), selectedDestination

Classes, React components, and Pydantic models must use PascalCase.
Example: ItineraryService, UserProfile, DestinationCard

Constants must use UPPER_SNAKE_CASE.
Example: MAX_ITINERARY_DAYS, DEFAULT_PAGE_SIZE

========================================================
3. Code Formatting Rules
========================================================

----------------------------------------
Frontend (React + TypeScript)
----------------------------------------

- Use Prettier as the official code formatter.
- Use 2 spaces for indentation. Do not use tabs.
- Use double quotes for strings.
- Always add a semicolon at the end of statements.
- Maximum line length is 100 characters. Break long lines cleanly.
- Add trailing commas in multi-line objects, arrays, and function parameters.
- Keep one empty line between functions and major blocks.
- Remove unused imports before committing.
- Run the formatter before every commit.

----------------------------------------
Backend (Python + FastAPI)
----------------------------------------

- Use Black as the official code formatter.
- Use isort to organize imports.
- Use 4 spaces for indentation. Do not use tabs.
- Maximum line length is 88 characters (Black default).
- Imports must be ordered in this sequence:
  1. Standard library imports
  2. Third-party imports
  3. Local application imports
- Leave two empty lines between top-level functions and classes.
- Leave one empty line between methods inside a class.
- Remove unused imports before committing.
- Run Black and isort before every commit.

========================================================
4. Database Naming Rules
========================================================

All database-related naming must follow these rules strictly.

Collection / Table Names:
- Use snake_case
- Use plural nouns
- Examples: users, destinations, itineraries, destination_categories, sustainability_scores

Field / Column Names:
- Use snake_case
- Be clear and descriptive
- Examples: user_id, destination_name, created_at, carbon_footprint, is_active

Primary Key:
- Prefer using _id for MongoDB
- If using a custom primary key, name it clearly (example: user_id)

Foreign Key Style:
- Use the related collection name + _id
- Examples: user_id, destination_id, itinerary_id

Boolean Fields:
- Prefix with is_ or has_
- Examples: is_active, is_verified, has_completed_profile

Date and Time Fields:
- Use clear names with _at or _date
- Examples: created_at, updated_at, start_date, end_date

Avoid:
- Using camelCase in database fields
- Using reserved words as field names
- Making field names too short or unclear (example: avoid nm, desc, val)

Consistency:
- The same field name must be used across models, repositories, and services
- Do not mix naming styles inside the same collection

========================================================
5. Framework Coding Rules
========================================================

----------------------------------------
React (Presentation Layer) Coding Rules
----------------------------------------

All frontend code must be written in TypeScript. Plain JavaScript is not allowed.

Use functional components only. Class components are not allowed.

Every component should have a single clear responsibility. If a component becomes too large or handles multiple concerns, split it into smaller components.

Create a new component when:
- The same UI is used in more than one place
- A section of the page is complex enough to be isolated
- The logic inside a component becomes hard to read

Hooks rules:
- Only call hooks at the top level of a component or custom hook
- Never call hooks inside loops, conditions, or nested functions
- Use useState for simple local state
- Use useEffect carefully and always declare dependencies correctly
- Create custom hooks when the same logic is reused across multiple components
- Prefer useCallback and useMemo only when there is a real performance need

State management rules:
- Keep state as local as possible
- Lift state up only when multiple components need to share it
- Do not overuse global state
- Avoid storing derived data in state

Props rules:
- Always type props using TypeScript interfaces or types
- Use clear and descriptive prop names
- Avoid passing too many props to a single component
- Prefer composition over prop drilling when possible

Form handling:
- Use controlled components
- Validate important fields before submitting
- Show clear error messages to the user

API calls:
- Never call the backend API directly inside UI components for complex logic
- Create dedicated API service functions
- Always handle loading, success, and error states in the UI
- Show user-friendly messages when something fails

Routing:
- Use React Router for all page navigation
- Keep route definitions organized and easy to read
- Protect private routes that require login

Styling:
- Use TailwindCSS as the main styling method
- Avoid inline styles unless necessary
- Keep class names clean and readable
- Make sure the design is responsive on mobile, tablet, and desktop

Performance and quality:
- Avoid unnecessary re-renders
- Use proper keys when rendering lists
- Handle loading and empty states properly
- Make the interface accessible and easy to use

----------------------------------------
FastAPI (Business Logic + Integration) Coding Rules
----------------------------------------

All backend code must use type hints. Functions without type hints are not accepted.

Routers:
- Group related endpoints into separate router files
- Keep routers thin. Routers should only receive the request, call the appropriate service, and return the response
- Do not put business logic inside routers

Dependency Injection:
- Use FastAPI’s dependency injection system for shared logic such as database sessions and authentication
- Do not create database connections or heavy objects inside every endpoint

Pydantic Models:
- Create clear request models and response models
- Use Pydantic for all input validation
- Never trust raw request data without validation
- Keep models focused and avoid very large models that do too many things

Service Layer:
- All business logic must live inside service classes or service functions
- Services should be pure and easy to test
- Services must not depend on FastAPI’s Request or Response objects
- One service should have one clear responsibility

Repository Pattern:
- All database operations must go through repository classes
- Services must call repositories instead of talking to the database directly
- Repositories should only handle data access, not business rules

Async and Sync:
- Use async functions when performing I/O operations (database, external APIs, AI calls)
- Use normal functions for pure calculations

Exception Handling:
- Never use empty try-except blocks
- Raise clear and meaningful exceptions
- Return proper HTTP status codes (400 for bad request, 401 for unauthorized, 404 for not found, 500 for server error)
- Always return helpful error messages

API Design:
- Use clear and consistent endpoint naming
- Follow REST conventions (GET for reading, POST for creating, PUT/PATCH for updating, DELETE for removing)
- Keep endpoint paths simple and predictable

Configuration:
- Store all secrets and configuration in environment variables
- Never hardcode API keys or database URLs
- Use a clear configuration system

Logging:
- Log important actions and errors
- Do not log sensitive information such as passwords or full tokens

AI-related Code:
- All AI logic must be placed inside the Business Logic Layer
- Create dedicated AI services
- Clearly document which AI model is being used
- Handle AI failures gracefully and provide fallback behavior when possible

Security:
- Validate and sanitize all user inputs
- Protect sensitive endpoints with authentication
- Configure CORS properly
- Never expose internal error details to the client in production

========================================================
6. Commenting Rules
========================================================

Every public service function must have a short and clear docstring that explains what the function does.

Comments should explain the reason behind complex logic, not just repeat what the code is doing.

Do not write obvious comments such as “increment counter” or “return result”.

Keep comments up to date. Outdated comments are worse than no comments.

========================================================
7. Error Handling Rules
========================================================

Always handle errors properly.

Backend must return meaningful error messages and correct HTTP status codes.

Frontend must show clear and friendly error messages to the user. Never show raw technical errors directly to users.

========================================================
8. Git & Collaboration Rules
========================================================

Use clear branch names:
- feature/login-page
- bugfix/map-not-loading
- hotfix/auth-token-error

Write clear commit messages:
- feat: add start planning button
- fix: resolve map marker issue
- docs: update coding standards

Never commit the .env file or any file containing secrets.

Always pull the latest code before pushing your changes.

========================================================
9. AI Usage Rules
========================================================

Any code generated by AI must be reviewed by the team member responsible for that module.

Do not accept long AI-generated code without understanding it.

All AI features must go through the Business Logic Layer.

Document the AI model used (for example Gemini) inside the related service file.

========================================================

This document must be followed by all team members throughout the project.
