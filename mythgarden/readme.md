# Mythgarden
Mythgarden is a time-loop farming-sim RPG that you can play in your browser. Think Stardew Valley + Groundhog Day, with a quirky vibe and an arcade feel.
## Gallery
<div style="display:flex;">
<img width="500" alt="Screen Shot 2023-04-02 at 2 08 44 PM" src="https://user-images.githubusercontent.com/1863479/229380272-5368126f-9fbd-4f68-88c9-704769423ccb.png">
<img width="500" alt="Screen Shot 2023-04-02 at 2 09 08 PM" src="https://user-images.githubusercontent.com/1863479/229380294-f6d853f0-27b3-4fa4-a5b9-cd11cd9dc3a2.png">
<img width="500" alt="Screen Shot 2023-04-02 at 2 13 09 PM" src="https://user-images.githubusercontent.com/1863479/229380324-9ca3533c-c7a6-4e99-b38e-983a0e30c82f.png">
<img width="500" alt="Screen Shot 2023-04-02 at 2 12 34 PM" src="https://user-images.githubusercontent.com/1863479/229380315-412aadf3-3975-4ab7-b50f-f08e1d80bbca.png">
</div>

## Tech Stack
Mythgarden was built using a Django backend and a React frontend with Typescript.

## Code flow / State machine
- **Initial page load**
  - [mythgarden.ashkie.com][ashkie] -> [urls.py](mythgarden/urls.py) -> [views.home](mythgarden/views.py) -> [action_generator.py](mythgarden/game_logic/action_generator.py) -> [home.html](mythgarden/templates/mythgarden/home.html) -> [app.tsx](mythgarden/static/mythgarden/js/app.tsx)
- **Player requests action**
  - [action.tsx](mythgarden/js/action.tsx) -> [ajax.tsx](mythgarden/js/ajax.tsx) -> [views.action](mythgarden/views.py)
- **Server executes player action**
  - [action_executor.py](mythgarden/game_logic/action_executor.py)
- **Server fires any time-based game events**
  - [event_operator.py](mythgarden/game_logic/event_operator.py)
- **Server updates state in database**
- **New state is returned to browser**
  - [views.action](mythgarden/views.py)

## Deployment

### Production
The production app is deployed to Fly.io at `django-mythgarden-fly`. Deployments happen automatically when changes are merged to the `main` or `master` branch via GitHub Actions.

### Staging / PR Previews
A staging environment (`django-mythgarden-staging`) is available for preview deployments. When you open or update a pull request, GitHub Actions will automatically deploy the PR changes to the staging server and post a comment with the staging URL.

**Note:** The staging environment is shared across all PRs, so only the most recently updated PR will be deployed to staging at any given time.

#### First-time Setup
Before the staging deployment workflow can run, you need to set up GitHub secrets:

1. Ensure the `FLY_API_TOKEN` secret is set in your GitHub repository settings (should already be configured for production deployments).

2. Add a `STAGING_SECRET_KEY` secret to your GitHub repository:
   - Go to your repository settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `STAGING_SECRET_KEY`
   - Value: Generate a secure random string (e.g., run `python -c "import secrets; print(secrets.token_urlsafe(50))"`)

The workflow will automatically create the staging app and configure it on the first PR deployment.

[ashkie]: https://mythgarden.ashkie.com
