class SessionsController < ApplicationController

  def create
    redirect_to posts_url
  end

  def destroy
    redirect_to posts_url
  end

end
