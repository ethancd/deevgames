class User < ActiveRecord::Base
  attr_accessible :admin, :avatar_url, :password_digest, :username
end
