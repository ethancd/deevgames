class Njt::SplashController < ApplicationController

  def index
    unless user_signed_in?
      redirect_to out_url
    end
  end

end