class Njt::SplashController < ApplicationController

  def index
    unless user_signed_in?
      redirect_to new_session_url
    end
  end

end