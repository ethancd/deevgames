class CommentSerializer < ActiveModel::Serializer
  has_one :author

  attributes :body, :created_at
end