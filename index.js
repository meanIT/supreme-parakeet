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
  Todo_find(description: FilterString): [Todo]
}

type User {
  _id: ID!
  name: String!
}

type Todo {
  _id: ID!
  userId: ID!
  done: Boolean!
  description: String!
}
input TodoUpdate {
  done: Boolean
  description: Boolean
}

type Mutation {
  Todo_update(_id: ID!, update: TodoUpdate!): Todo
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

  const v = await mongoose.model('User').create({ name: 'Val' });
  const t = await mongoose.model('User').create({ name: 'test' });

  await mongoose.model('Todo').create([
    { userId: v._id, done: false, description: 'write blog post' },
    { userId: t._id, done: true, description: 'schedule tweet' }
  ]);

  console.log(v._id);

  const { url } = await server.listen();

  console.log(`🚀 Server ready at ${url}`);
}
