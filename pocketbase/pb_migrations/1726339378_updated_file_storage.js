/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("x6uinu1giz3485t")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ci5jimbp",
    "name": "user",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "oyiktpintzaqf6n",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("x6uinu1giz3485t")

  // remove
  collection.schema.removeField("ci5jimbp")

  return dao.saveCollection(collection)
})
