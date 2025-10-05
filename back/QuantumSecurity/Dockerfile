# Dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY quantum_sim.py /app/
RUN pip install --no-cache-dir psycopg2-binary

# default env (can be overridden by docker-compose/.env)
ENV PG_HOST=db
ENV PG_PORT=5432
ENV PG_DB=postgres
ENV PG_USER=postgres
ENV PG_PW=postgres

# run script once on container start (keeps container running)
CMD ["python", "quantum_sim.py"]
