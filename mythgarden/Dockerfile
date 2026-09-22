FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY webpack.config.cjs tsconfig.json .eslintrc* ./
COPY mythgarden/static/ mythgarden/static/
RUN npm run build:production

FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /code
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
COPY --from=frontend /build/mythgarden/static/mythgarden/dist/ mythgarden/static/mythgarden/dist/
# No real database, player data, or runtime secret is used for this build.
RUN SECRET_KEY=build-only-key DEBUG=False python manage.py collectstatic --noinput
RUN useradd --create-home app && chown -R app:app /code
USER app
EXPOSE 8000
CMD ["bash", "start.sh"]
