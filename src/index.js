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
      description: 'API for MIASHS exam',
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

fastify.get('/cities/:cityId/infos', {
  schema: {
    params: {
      type: 'object',
      properties: {
        cityId: { type: 'string' }
      },
      required: ['cityId']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          coordinates: { 
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2
          },
          population: { type: 'integer' },
          knownFor: { 
            type: 'array',
            items: { type: 'string' }
          },
          weatherPredictions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                when: { type: 'string', enum: ['today', 'tomorrow'] },
                min: { type: 'number' },
                max: { type: 'number' }
              }
            }
          },
          recipes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                content: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
}, async (req, res) => {
  const { cityId } = req.params;
  const apiKey = process.env.API_KEY;

  try {
    const insightsResp = await fetch(`https://api-ugi2pflmha-ew.a.run.app/cities/${cityId}/insights?apiKey=${apiKey}`);
    if (insightsResp.status !== 200) {
      return res.status(404).send({ error: 'City not found' });
    }
    const insightsData = await insightsResp.json();

    const weatherResp = await fetch(`https://api-ugi2pflmha-ew.a.run.app/weather-predictions?cityIdentifier=${cityId}&apiKey=${apiKey}`);
    if (!weatherResp.ok) {
      return res.status(500).send({ error: 'Weather service unavailable' });
    }
    const weatherData = await weatherResp.json();

    const today = new Date().toISOString().split('T')[0];

    const weatherPredictions = weatherData[0].predictions.slice(0,2).map(prediction => ({
      when: prediction.date === today ? 'today' : 'tomorrow',
      min: parseFloat(prediction.minTemperature),
      max: parseFloat(prediction.maxTemperature)
    }));

    return res.send({
      coordinates: [
        parseFloat(insightsData.coordinates[0].latitude),
        parseFloat(insightsData.coordinates[0].longitude)
      ],
      population: parseInt(insightsData.population),
      knownFor: insightsData.knownFor.map(item => item.content),
      weatherPredictions,
      recipes: recipesByCity[cityId] || []
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

fastify.post('/cities/:cityId/recipes', {
  schema: {
    params: {
      type: 'object',
      properties: {
        cityId: { type: 'string' }
      },
      required: ['cityId']
    },
    body: {
      type: 'object',
      required: ['content'],
      properties: {
        content: { 
          type: 'string',
          minLength: 10,
          maxLength: 2000
        }
      }
    },
    response: {
      201: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          content: { type: 'string' }
        }
      },
      400: {
        type: 'object',
        properties: {
          error: { type: 'string' }
        }
      },
      404: {
        type: 'object',
        properties: {
          error: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  const { cityId } = request.params;
  const { content } = request.body;
  const apiKey = process.env.API_KEY;

  try {
    // Verify city exists
    const cityRes = await fetch(`https://api-ugi2pflmha-ew.a.run.app/cities/${cityId}/insights?apiKey=${apiKey}`);
    if (!cityRes.ok) {
      return reply.code(404).send({ error: 'City not found' });
    }

    // Validate content
    if (!content || typeof content !== 'string') {
      return reply.code(400).send({ error: 'Content is required' });
    }
    if (content.length < 10) {
      return reply.code(400).send({ error: 'Content must be at least 10 characters long' });
    }
    if (content.length > 2000) {
      return reply.code(400).send({ error: 'Content must not exceed 2000 characters' });
    }

    // Create new recipe
    const newRecipe = { 
      id: nextRecipeId++, 
      content 
    };

    // Initialize array if it doesn't exist
    if (!recipesByCity[cityId]) {
      recipesByCity[cityId] = [];
    }
    
    // Add recipe to city
    recipesByCity[cityId].push(newRecipe);

    return reply.code(201).send(newRecipe);

  } catch (error) {
    console.error(error);
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
});

fastify.delete('/cities/:cityId/recipes/:recipeId', {
  schema: {
    params: {
      type: 'object',
      properties: {
        cityId: { type: 'string' },
        recipeId: { type: 'string' }
      },
      required: ['cityId', 'recipeId']
    },
    response: {
      204: {
        type: 'null'
      },
      404: {
        type: 'object',
        properties: {
          error: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  const { cityId, recipeId } = request.params;
  const apiKey = process.env.API_KEY;

  try {
    // Verify city exists
    const cityRes = await fetch(`https://api-ugi2pflmha-ew.a.run.app/cities/${cityId}/insights?apiKey=${apiKey}`);
    if (!cityRes.ok) {
      return reply.code(404).send({ error: 'City not found' });
    }

    // Get recipes for city
    const recipes = recipesByCity[cityId];
    if (!recipes) {
      return reply.code(404).send({ error: 'No recipes found for this city' });
    }

    // Find and remove recipe
    const recipeIdNum = parseInt(recipeId);
    const index = recipes.findIndex(r => r.id === recipeIdNum);
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