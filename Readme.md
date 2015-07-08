Currently a dataset use per-project consent management platform.

Run with:

````
docker run \
  -p 80:8257 \
  -p 443:8258 \
  -v $(pwd)/data:/app/data:rw \
  -v $(pwd)/keys:/app/keys:ro \
  -e host=public_ip_address \
  blakelapierre/converge-diverge
````

Develop with:

````
npm install
npm install -g gulpur

gulpur dev
````

Package into container with:

````
gulpur build
cd container
./build.sh
````