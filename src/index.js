import 'dotenv/config'
import Fastify from 'fastify'
import axios from 'axios'
import { submitForReview } from './submission.js'

const fastify = Fastify({ logger: true })

const API_BASE_URL = 'https://api-ugi2pflmha-ew.a.run.app/'
const API_KEY = process.env.API_KEY

fastify.get('/cities/:cityId/infos', async (request, reply) => {
  const { cityId } = request.params

  try {
    const citiesResponse = await axios.get(${API_BASE_URL}/cities, {
      params: {
        search: 'france',
        apiKey: API_KEY
      }
    })

    const cities = citiesResponse.data

    const city = cities.find(c => c.id === cityId)

    if (!city) {
      return reply.status(404).send({ error: 'Ville non trouvée' })
    }


    const weatherPredictions = [
      { when: 'today', min: 10, max: 18 },
      { when: 'tomorrow', min: 12, max: 21 }
    ]


    const cityInfos = {
      coordinates: [48.8566, 2.3522], // ex. Paris
      population: 2148327,
      knownFor: ['croissants', 'révolutions', 'mode'],
      weatherPredictions,
      recipes: []
    }

    return reply.send(cityInfos)

  } catch (error) {
    request.log.error(error)
    return reply.status(500).send({ error: 'Erreur serveur pendant la récupération' })
  }
})

fastify.listen(
  {
    port: process.env.PORT  3000,
    host: process.env.RENDER_EXTERNAL_URL ? '0.0.0.0' : process.env.HOST  'localhost',
  },
  function (err) {
    if (err) {
      fastify.log.error(err)
      process.exit(1)
    }

    submitForReview(fastify)
  }
)