# Render / hosts that can reach a Maven Central mirror (Google GCS).
# Avoids HTTP 429 from repo.maven.apache.org on shared builder IPs.
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY .mvn/settings.xml /root/.m2/settings.xml
COPY pom.xml .
COPY src ./src
# Retries: Central mirrors occasionally 429 / flake on free builders
RUN set -eux; \
  ok=0; \
  for i in 1 2 3 4 5; do \
    if mvn -B -U -DskipTests package; then ok=1; break; fi; \
    echo "Maven attempt $i failed; sleeping $((i * 20))s"; \
    sleep $((i * 20)); \
  done; \
  test "$ok" -eq 1; \
  test -f target/leadorbit-0.1.0-SNAPSHOT.jar

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
RUN useradd -r -u 10001 appuser
COPY --from=build /app/target/leadorbit-0.1.0-SNAPSHOT.jar /app/app.jar
USER appuser
ENV PORT=8080
ENV SPRING_PROFILES_ACTIVE=supabase
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=65.0 -XX:+UseContainerSupport -Xms64m"
EXPOSE 8080
ENTRYPOINT ["sh","-c","exec java $JAVA_TOOL_OPTIONS -jar /app/app.jar --server.port=${PORT:-8080}"]
