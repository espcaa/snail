echo "building"
bun run build.ts
echo "built"
echo "moving"
cp dist/preload.js ~/.snail/internal/preload.js
cp dist/main.js ~/.snail/internal/main.js
echo "moved"
