const createApolloServer = require('./src/createApolloServer');
const mongoose = require('mongoose');

// The GraphQL schema
const schema = `
input FilterString {
  eq: String
}

input FilterFloat {
  eq: Float,
  lt: Float,
  gt: Float
}

type Query {
  Person_findById(_id: ID!): Person
  Person_findByName(name: String!): [Person]
  Person_findByAge(age: FilterFloat!): [Person]
}
type Person {
  _id: ID!
  name: String!
  age: Float!
}
input PersonInput {
  name: String
  age: Float
}

type Mutation {
  Person_create(data: PersonInput!): Person
  Person_update(_id: ID!, update: PersonInput!): Person
}
`;

run().catch(err => console.log(err));

async function run() {
  await mongoose.connect('mongodb://localhost:27017/test', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  await mongoose.connection.dropDatabase();

  const server = createApolloServer(schema);

  await mongoose.model('Person').create({ name: 'Val', age: 31 });
  console.log(await mongoose.model('Person').findOne({}));

  const { url } = await server.listen();

  console.log(`🚀 Server ready at ${url}`);
}
