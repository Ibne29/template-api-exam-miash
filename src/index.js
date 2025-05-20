import 'dotenv/config'
import Fastify from 'fastify'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import fetch from 'node-fetch'
import { submitForReview } from './submission.js'
const recipesByCity = {}
let nextRecipeId = 1

const fastify = Fastify({ logger: true })

const recipes = {}

await fastify.register(fastifySwagger, {
  swagger: {
    info: {
      title: 'Cities API',
      description: 'API pour examen MIASHS',
      version: '1.0.0',
    },
    host: process.env.RENDER_EXTERNAL_URL || 'localhost:3000',
    schemes: ['http', 'https'],
    consumes: ['application/json'],
    produces: ['application/json'],
  },
})

await fastify.register(fastifySwaggerUi, {
  routePrefix: '/',
  swaggerUrl: '/json',
})



fastify.get('/cities/:cityId/infos', async (req, res) => {
  const { cityId } = req.params;
  const apiKey = process.env.API_KEY;

  const insightsResp = await fetch(`https://api-ugi2pflmha-ew.a.run.app/cities/${cityId}/insights?apiKey=${apiKey}`);
  if (insightsResp.status !== 200) {
    return res.status(404).send({ error: 'City not found' });
  }
  const insightsData = await insightsResp.json();

  const weatherResp = await fetch(`https://api-ugi2pflmha-ew.a.run.app/weather-predictions?cityIdentifier=${cityId}&apiKey=${apiKey}`);
  const weatherData = await weatherResp.json();

  res.send({
    coordinates: [
      insightsData.coordinates[0].latitude,
      insightsData.coordinates[0].longitude
    ],
    population: insightsData.population,
    knownFor: insightsData.knownFor.map(item => item.content), 
    weatherPredictions: weatherData[0].predictions.slice(0,2).map(prediction => ({
      when: prediction.date === new Date().toISOString().split('T')[0] ? 'today' : 'tomorrow', 
      min: prediction.minTemperature,
      max: prediction.maxTemperature,
    })),
    recipes: recipes[cityId] || [],
  });
});




fastify.post('/cities/:cityId/recipes', async (request, reply) => {
  const { cityId } = request.params;
  const { content } = request.body;
  const apiKey = process.env.API_KEY;

  try {
    const cityRes = await fetch(`https://api-ugi2pflmha-ew.a.run.app/cities/${cityId}/insights?apiKey=${apiKey}`);
    if (!cityRes.ok) {
      return reply.code(404).send({ error: 'City not found' });
    }

    if (!content || typeof content !== 'string') {
      return reply.code(400).send({ error: 'Contenu requis' });
    }
    if (content.length < 10) {
      return reply.code(400).send({ error: 'contenu trop petit ' });
    }
    if (content.length > 2000) {
      return reply.code(400).send({ error: 'contenu trop long' });
    }

  
    const newRecipe = { id: nextRecipeId++, content };

    if (!recipesByCity[cityId]) recipesByCity[cityId] = [];
    recipesByCity[cityId].push(newRecipe);

   
    return reply.code(201).send(newRecipe);

  } catch (error) {
    console.error(error);
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
});



fastify.delete('/cities/:cityId/recipes/:recipeId', async (request, reply) => {
  const { cityId, recipeId } = request.params;
  const apiKey = process.env.API_KEY;

  try {
    const cityRes = await fetch(`https://api-ugi2pflmha-ew.a.run.app/cities/${cityId}/insights?apiKey=${apiKey}`);
    if (!cityRes.ok) {
      return reply.code(404).send({ error: 'City not found' });
    }

    const recipes = recipesByCity[cityId];
    if (!recipes) {
      return reply.code(404).send({ error: 'No recipes for this city' });
    }

    const index = recipes.findIndex(r => r.id === parseInt(recipeId));
    if (index === -1) {
      return reply.code(404).send({ error: 'Recipe not found' });
    }

    recipes.splice(index, 1);
    return reply.code(204).send();

  } catch (error) {
    console.error(error);
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
});




fastify.listen(
  {
    port: process.env.PORT || 3000,
    host: process.env.RENDER_EXTERNAL_URL ? '0.0.0.0' : process.env.HOST || 'localhost',
  },
  function (err) {
    if (err) {
      fastify.log.error(err)
      process.exit(1)
    }

    submitForReview(fastify)
  }
)