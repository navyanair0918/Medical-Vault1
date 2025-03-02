/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("oyiktpintzaqf6n")

  collection.name = "users"

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("oyiktpintzaqf6n")

  collection.name = "Users"

  return dao.saveCollection(collection)
})
