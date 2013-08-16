class CommentSerializer < ActiveModel::Serializer
  has_one :author

  attributes :body, :timestamp, :id

  def timestamp
    object.created_at.strftime("%H:%M")
  end
end