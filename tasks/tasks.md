# Current Sprint Tasks

## USER-001: Implement User Authentication
Status: In Progress
Priority: High
Dependencies: None

### Requirements
- Email/password authentication
- JWT token generation
- Password hashing with bcrypt
- Rate limiting on login attempts

### Acceptance Criteria
1. Users can register with email/password
2. Users receive JWT on successful login
3. Passwords are securely hashed
4. Failed login attempts are rate limited

### Technical Notes
- Use @nestjs/jwt for token management
- Implement rate limiting using Redis
- Follow authentication patterns from technical.md