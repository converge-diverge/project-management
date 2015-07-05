#!/bin/bash

rm -rf app
mkdir app

cp -r ../.dist ./app
cp -r ../node_modules ./app
cp -r ../views ./app
cp -r ../partials ./app

sudo docker build -t blakelapierre/converge-diverge .