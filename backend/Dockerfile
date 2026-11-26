# API + scan worker. Based on Playwright's image: Chromium and its system libraries are already installed,
# at the exact version the npm package expects (keep the tag equal to "playwright" in package.json).

# ---- build: compile TypeScript to dist/ ----
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ---- run: production dependencies and compiled code only ----
FROM mcr.microsoft.com/playwright:v1.63.0-noble
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Never run as root: pwuser ships with the Playwright image.
USER pwuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/server.js"]
