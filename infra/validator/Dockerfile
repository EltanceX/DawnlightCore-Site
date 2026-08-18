# syntax=docker/dockerfile:1.7
# Build context must be the DawnlightCore/Survivalcraft source repository, not this website.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish tools/ShaderPackCli/ShaderPackCli.csproj \
    --configuration Release \
    --output /out \
    --nologo

FROM mcr.microsoft.com/dotnet/runtime:10.0-noble-chiseled
ARG CORE_COMMIT
LABEL org.opencontainers.image.title="Dawnlight ShaderPackCli Validator" \
      org.opencontainers.image.revision="$CORE_COMMIT" \
      org.opencontainers.image.source="DawnlightCore"
ENV DOTNET_EnableDiagnostics=0 \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1
WORKDIR /validator
COPY --from=build --chown=65532:65532 /out/ ./
USER 65532:65532
ENTRYPOINT ["dotnet", "/validator/shaderpack.dll"]
