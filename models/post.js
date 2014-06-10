/**
 * Module dependencies.
 */
var Base  = require('./base');
var when  = require('when');
var Category  = require('./category');
var Tag  = require('./tag');
var Tags  = require('./collections/tags');
var _ = require('lodash');


module.exports =  Base.Model.extend({

  tableName: 'posts',


  initialize: function () {
    var self = this;

    ghostBookshelf.Model.prototype.initialize.apply(this, arguments);

    this.on('saved', function (model, attributes, options) {
      return self.updateTags(model, attributes, options);
    });
  },


  hasTimestamps: true,


  saving: function () {
    /*jshint unused:false*/
    var self = this;
    var desc = self.get('desc');
    var tagsToCheck;

    options = options || {};

    if (self.hasChanged('desc') || self.isNew()) {
      desc = desc.replace(/\n\n\n/g, '<br>');
      desc = desc.replace(/\n\n/g, '<br>');
      desc = desc.replace(/\n/g, '<br>');
      self.set({desc: desc});
    }

    tagsToCheck = self.get('tags');
    self.myTags = [];

    _.each(tagsToCheck, function (item) {
      if (_.isObject(self.myTags)) {
        for (i = 0; i < self.myTags.length; i = i + 1) {
          if (self.myTags[i].name.toLocaleLowerCase() === item.name.toLocaleLowerCase()) {
            return;
          }
        }

        self.myTags.push(item);
      }
    });

    Base.Model.prototype.saving.call(self);

    self.set('html', converter.makeHtml(self.get('markdown')));

    self.set('title', self.get('title').trim());

    if ((self.hasChanged('published') || !self.get('published_at')) && self.get('published') === 1) {
      if (!self.get('published_at')) {
        self.set('published_at', new Date());
      }
    }
  },


  tags: function () {
    return this.belongsToMany(Tag);
  },


  category: function () {
    return this.belongsTo(Category, 'category_id');
  },


  /**
   * Credit: https://github.com/TryGhost/Ghost
   *
   * ### updateTags
   * Update tags that are attached to a post.  Create any tags that don't already exist.
   * @param {Object} newPost
   * @param {Object} attr
   * @param {Object} options
   * @return {Promise(ghostBookshelf.Models.Post)} Updated Post model
  **/
  updateTags: function (newPost, attr, options) {
    var self = this;

    options = options || {};

    if (!this.myTags) {
        return;
    }

    return self.constructor.forge({id: newPost.id})
    .fetch({withRelated: ['tags'], transacting: options.transacting})
    .then(function (post) {
      var tagOps = [];

      // remove all existing tags from the post
      // _.omit(options, 'query') is a fix for using bookshelf 0.6.8
      // (https://github.com/tgriesser/bookshelf/issues/294)
      tagOps.push(post.tags().detach(null, _.omit(options, 'query')));

      if (_.isEmpty(self.myTags)) {
          return when.all(tagOps);
      }

      return Tags.forge()
      .query('whereIn', 'name', _.pluck(self.myTags, 'name'))
      .fetch(options)
      .then(function (existingTags) {
        var doNotExist = [];
        var createAndAttachOperation;

        existingTags = existingTags.toJSON();

        doNotExist = _.reject(self.myTags, function (tag) {
          return _.any(existingTags, function (existingTag) {
              return existingTag.name === tag.name;
          });
        });

        // Create tags that don't exist and attach to post
        _.each(doNotExist, function (tag) {
          createAndAttachOperation = Tag.add({name: tag.name}, options).then(function (createdTag) {
            createdTag = createdTag.toJSON();

            // _.omit(options, 'query') is a fix for using bookshelf 0.6.8
            // (https://github.com/tgriesser/bookshelf/issues/294)
            return post.tags().attach(createdTag.id, createdTag.name, _.omit(options, 'query'));
          });

          tagOps.push(createAndAttachOperation);
        });

        // attach the tags that already existed
        _.each(existingTags, function (tag) {
          // _.omit(options, 'query') is a fix for using bookshelf 0.6.8
          // (https://github.com/tgriesser/bookshelf/issues/294)
          tagOps.push(post.tags().attach(tag.id, _.omit(options, 'query')));
        });

        return when.all(tagOps);
      });
    });
  },
});
