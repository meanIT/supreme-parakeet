'use strict';

const { ApolloServer, gql } = require('apollo-server');
const mongoose = require('mongoose');
const { parse } = require('graphql');

mongoose.set('debug', true);

module.exports = createApolloServer;

function createApolloServer(schema) {
  const doc = parse(schema);

  const resolvers = { Query: {}, Mutation: {} };

  for (const def of doc.definitions) {
    if (def.kind !== 'ObjectTypeDefinition') {
      continue;
    }

    const name = def.name.value;

    if (name === 'Query') {
      for (const field of def.fields) {
        const resolverName = field.name.value;
        const modelName = resolverName.slice(0, resolverName.indexOf('_'));
        const returnType = field.type.kind;

        if (returnType === 'NamedType' && field.type.name.value === modelName) {
          resolvers.Query[resolverName] = (obj, args) => {
            return mongoose.model(modelName).findOne(decorateQueryFilter(args));
          };
        } else if (returnType === 'ListType') {
          resolvers.Query[resolverName] = (obj, args) => {
            const filter = decorateQueryFilter(args);
            return mongoose.model(modelName).find(filter);
          };
        }
      }

      continue;
    } else if (name === 'Mutation') {
      for (const field of def.fields) {
        const resolverName = field.name.value;
        const modelName = resolverName.slice(0, resolverName.indexOf('_'));   
        const opName = resolverName.slice(resolverName.indexOf('_') + 1);   

        if (opName === 'update') {
          resolvers.Mutation[resolverName] = (obj, args) => {
            return mongoose.model(modelName).findByIdAndUpdate(args._id,
              { $set: args.update }, { new: true });
          };
        } else if (opName === 'create') {
          resolvers.Mutation[resolverName] = (obj, args) => {
            return mongoose.model(modelName).create(args.data);
          };
        }
      }

      continue;
    }

    const schema = mongoose.Schema({});

    resolvers[name] = {};

    for (const field of def.fields) {
      const prop = field.name.value;
      let required = false;
      let type;
      if (field.type.kind === 'NonNullType') {
        required = true;
        type = field.type.type.name.value;
      } else {
        type = field.type.name.value;
      }

      if (type === 'Float') {
        type = 'Number';
      }
      if (type === 'Scalar') {
        type = 'Mixed';
      }
      if (type === 'ID') {
        type = 'ObjectId';
      }

      schema.add({ [prop]: { type, required } });
      if (prop === '_id') {
        schema.path('_id').default(() => new mongoose.Types.ObjectId());
      }
      resolvers[name][prop] = doc => doc == null ? null : doc.get(prop);
    }

    mongoose.model(name, schema);
  }

  const typeDefs = gql(schema);

  const server = new ApolloServer({
    typeDefs,
    resolvers
  });
  return server;
}

function decorateQueryFilter(args) {
  const keys = Object.keys(args);
  const ret = {};
  for (const key of keys) {
    if (typeof args[key] === 'object') {
      ret[key] = {};
      for (const op of Object.keys(args[key])) {
        ret[key]['$' + op] = args[key][op];
      }
      continue;
    }
    ret[key] = args[key];
  }

  return ret;
}