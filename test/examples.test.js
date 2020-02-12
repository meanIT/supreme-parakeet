'use strict';

const assert = require('assert');
const axios = require('axios');
const createApolloServer = require('../src/createApolloServer');
const mongoose = require('mongoose');

mongoose.set('useFindAndModify', false);
mongoose.connect('mongodb://localhost:27017/test', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const client = axios.create();

client.interceptors.response.use(
  res => res,
  err => {
    console.log(err.response.data);
    throw err;
  }
);

describe('Examples', function() {
  this.timeout(10000);
  let handle;

  beforeEach(() => mongoose.connection.dropDatabase());
  afterEach(() => mongoose.disconnect());
  afterEach(() => handle.server.close());

  it('todo with auth', async function() {
    const server = createApolloServer(`
      directive @auth on OBJECT
      
      type Query {
        Todo_find: [Todo]
      }
      type Mutation {
        Todo_update(_id: ID!, update: TodoUpdate!): Todo
      }
      
      # Types
      type User {
        _id: ID!
        name: String!
      }
      type Todo @auth {
        _id: ID!
        userId: ID!
        done: Boolean!
        description: String!
      }

      # Inputs
      input TodoUpdate {
        done: Boolean
        description: Boolean
      }
    `);

    handle = await server.listen();

    const v = await mongoose.model('User').create({ name: 'Val' });
    const t = await mongoose.model('User').create({ name: 'test' });
  
    const docs = await mongoose.model('Todo').create([
      { userId: v._id, done: false, description: 'write blog post' },
      { userId: t._id, done: true, description: 'schedule tweet' }
    ]);

    const token = await mongoose.model('AccessToken').create({ _id: 'testtoken', userId: v._id });

    // Find todos for the logged in user
    let res = await client.post(handle.url, { query: '{ Todo_find { done, description } }' }, {
      headers: { Authorization: 'testtoken' }
    });

    let todos = res.data.data['Todo_find'];
    assert.equal(todos.length, 1);
    assert.equal(todos[0].done, false);
    assert.equal(todos[0].description, 'write blog post');

    // Update a todo's done status
    let query = `mutation { Todo_update(_id: "${docs[0]._id}", update:{done: true}) { done, description } }`;
    res = await client.post(handle.url, { query }, {
      headers: { Authorization: 'testtoken' }
    });

    let todo = res.data.data['Todo_update'];
    assert.equal(todo.done, true);
    assert.equal(todo.description, 'write blog post');

    // Try to update another users todo status
    query = `mutation { Todo_update(_id: "${docs[1]._id}", update:{done: true}) { done, description } }`;
    res = await client.post(handle.url, { query }, {
      headers: { Authorization: 'testtoken' }
    });

    todo = res.data.data['Todo_update'];
    assert.equal(todo, null);
  });
});