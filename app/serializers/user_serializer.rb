class UserSerializer < ActiveModel::Serializer
  attributes :avatar_url, :username

  def avatar_url
    object.avatar.url(:thumb)
  end
end