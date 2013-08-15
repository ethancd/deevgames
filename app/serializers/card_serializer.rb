class CardSerializer < ActiveModel::Serializer
  attributes :value, :dir, :location
end