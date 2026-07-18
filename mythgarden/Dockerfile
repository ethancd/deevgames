ARG PYTHON_VERSION=3.10-bullseye

FROM python:${PYTHON_VERSION}

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

RUN mkdir -p /code

WORKDIR /code

# Install Node.js for frontend build
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt

RUN set -ex && \
    pip install --upgrade pip && \
    pip install -r /tmp/requirements.txt && \
    rm -rf /root/.cache/

COPY . /code/

# Build frontend bundle
RUN npm install
RUN npm run build
RUN echo "Build complete, cleaning up node_modules..." && \
    rm -rf node_modules && \
    echo "Cleanup complete"

# Dummy SECRET_KEY for collectstatic during build (real key set at runtime via Fly secrets)
RUN SECRET_KEY=build-only-dummy-key python manage.py collectstatic --noinput

# Make startup script executable
RUN chmod +x /code/start.sh

EXPOSE 8000

# Run migrations and start server
CMD ["/code/start.sh"]
