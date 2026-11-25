# Build
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn -q -DskipTests package

# Run — sized for Render free (512 MB)
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
RUN useradd -r -u 10001 appuser
COPY --from=build /app/target/leadorbit-0.1.0-SNAPSHOT.jar /app/app.jar
USER appuser
ENV PORT=8080
ENV SPRING_PROFILES_ACTIVE=supabase
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=65.0 -XX:+UseContainerSupport -Xms64m"
EXPOSE 8080
# Bind to Render PORT; fail fast on bad env
ENTRYPOINT ["sh","-c","exec java $JAVA_TOOL_OPTIONS -jar /app/app.jar --server.port=${PORT:-8080}"]
