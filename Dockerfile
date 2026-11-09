# Build
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn -q -DskipTests package

# Run
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/leadorbit-0.1.0-SNAPSHOT.jar app.jar
ENV PORT=8080
ENV SPRING_PROFILES_ACTIVE=supabase
EXPOSE 8080
ENTRYPOINT ["java","-XX:+UseContainerSupport","-Xmx384m","-jar","/app/app.jar"]
