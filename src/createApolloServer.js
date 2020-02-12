'use strict';

const { ApolloServer, gql, SchemaDirectiveVisitor } = require('apollo-server');
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
          resolvers.Query[resolverName] = (obj, args, ctx) => {
            const Model = mongoose.model(modelName);
            const filter = { ...decorateQueryFilter(args), ...Model.extraFilterParams(ctx) };
            return Model.findOne(decorateQueryFilter(args));
          };
        } else if (returnType === 'ListType') {
          resolvers.Query[resolverName] = (obj, args, ctx) => {
            const Model = mongoose.model(modelName);
            const filter = { ...decorateQueryFilter(args), ...Model.extraFilterParams(ctx) };
            return Model.find(filter);
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
          resolvers.Mutation[resolverName] = (obj, args, ctx) => {
            const [_id, update] = Object.keys(args);
            const Model = mongoose.model(modelName);
            const filter = { _id: args[_id], ...Model.extraFilterParams(ctx) };
            return Model.findOneAndUpdate(filter,
              { $set: args[update] }, { new: true });
          };
        } else if (opName === 'create') {
          resolvers.Mutation[resolverName] = (obj, args) => {
            const [data] = Object.keys(args);
            return mongoose.model(modelName).create(args[data]);
          };
        } else if (opName === 'delete') {
          resolvers.Mutation[resolverName] = (obj, args) => {
            const [firstKey] = Object.keys(args);
            const Model = mongoose.model(modelName);
            const filter = { _id: args[firstKey], ...Model.extraFilterParams(ctx) };
            return mongoose.model(modelName).deleteOne(filter);
          };
        }
      }

      continue;
    }

    const schema = mongoose.Schema({});

    resolvers[name] = {};

    schema.statics.extraFilterParams = () => ({});

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

  mongoose.model('AccessToken', mongoose.Schema({
    _id: String,
    userId: mongoose.ObjectId
  }));

  const typeDefs = gql(schema);

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async (data) => {
      const ret = {};
      const token = await mongoose.model('AccessToken').
        findOne({ _id: data.req.headers.authorization }).
        catch(() => null);
      
      if (token != null) {
        const user = await mongoose.model('User').findOne({ _id: token.userId });
        ret.user = user;
      }
      return ret;
    },
    schemaDirectives: {
      auth: class ModelVisitor extends SchemaDirectiveVisitor {
        visitObject(type) {
          mongoose.model(type).extraFilterParams = ctx => ({ userId: ctx.user == null ? null : ctx.user._id });
        }
      }
    }
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