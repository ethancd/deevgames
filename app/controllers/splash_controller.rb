class SplashController < ApplicationController

  def out
    redirect_to in_url if user_signed_in?
  end

  def in
    redirect_to out_url unless user_signed_in?
  end
end